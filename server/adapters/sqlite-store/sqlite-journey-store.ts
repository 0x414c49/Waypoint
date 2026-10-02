// SqliteJourneyStore: a JourneyStore port backed by node:sqlite (ADR-0014).
// Same unit-of-work contract as the former JSON store: materialize the whole
// JourneyState, reuse assertValidState + assertJourneyStateTransition
// unchanged, diff per collection by id-set + equalJson, write with
// parameterized statements inside one BEGIN IMMEDIATE transaction.
// No ORM, no triggers, no per-entity repositories.

import { DatabaseSync, type StatementSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { chmod, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import type { JourneyState } from "../../domain/journey-state.js";
import type { Clock } from "../../ports/clock.js";
import type { IdGenerator } from "../../ports/id-generator.js";
import type {
  JourneyStore,
  Mutation,
  TransactionIntent,
  TransactionResult,
} from "../../ports/journey-store.js";
import { AsyncMutex } from "../async-mutex.js";
import { StoreError } from "../store-errors.js";
import {
  assertValidState,
  clone,
  deepFreeze,
  equalJson,
  parseJson,
} from "../state-codec.js";
import { assertJourneyStateTransition } from "../transition-policy.js";
import type { StoreDiagnostics, StoreMarker } from "../store-types.js";
import {
  accountToRow,
  authInviteToRow,
  authSessionToRow,
  dailyReviewToRow,
  decisionReviewToRow,
  decisionToRow,
  emailPreferenceToRow,
  focusAreaToRow,
  journeyEntryToRow,
  lifecycleEventToRow,
  mediaRecordToRow,
  milestoneToRow,
  quarterToRow,
  receiptMapKey,
  receiptToRow,
  rowToAccount,
  rowToAiReview,
  rowToAuthInvite,
  rowToAuthSession,
  rowToDailyReview,
  rowToDecision,
  rowToDecisionReview,
  rowToEmailPreference,
  rowToFocusArea,
  rowToJourneyEntry,
  rowToLifecycleEvent,
  rowToMediaRecord,
  rowToMilestone,
  rowToQuarter,
  rowToReceipt,
  rowToSession,
  rowToTask,
  rowToUser,
  sessionToRow,
  taskToRow,
  aiReviewToRow,
  userToRow,
  type Row,
  type RowParams,
} from "./mappers.js";
import {
  collectAffectedFtsDocIds,
  composeFtsDocForRecord,
  type ChangedIds,
  type FtsCollection,
} from "./fts-composer.js";

const DB_FILENAME = "waypoint.db";
const MARKER_FILENAME = ".journey-store";

// schema.sql is the canonical DDL. It ships next to this module; the loader
// resolves it relative to import.meta.url so tests and tsx agree. The Docker
// image only copies dist/, so Phase 2 must also copy this .sql next to the
// compiled output (or inline it) before the SQLite store can boot in prod.
const SCHEMA_SQL: string = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");

export type SqliteFailpoint = "before-commit" | "after-commit";

export interface SqliteJourneyStoreOptions {
  readonly directory: string;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly seed: (writtenAt: string) => JourneyState;
  readonly mutexTimeoutMs?: number;
  readonly failpoint?: (point: SqliteFailpoint) => void;
}

function isBusyError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /SQLITE_BUSY|database is locked|database table is locked/i.test(error.message)
  );
}

type CollectionName = keyof JourneyState["records"];

// Insert/update pass follows FK dependencies (parents before children);
// the delete pass below runs in the exact reverse order.
const WRITE_ORDER: readonly CollectionName[] = [
  "users",
  "accounts",
  "quarters",
  "focusAreas",
  "milestones",
  "tasks",
  "sessions",
  "taskLifecycleEvents",
  "dailyReviews",
  "decisionRecords",
  "decisionReviews",
  "journeyEntries",
  "aiReviews",
  "authInvites",
  "authSessions",
  "mediaRecords",
  "emailPreferences",
];

interface TableStatements {
  readonly insert: string;
  readonly update: string;
  readonly remove: string;
  readonly select: string;
}

function tableStatements(table: string, columns: readonly string[]): TableStatements {
  const assignments = columns.filter((column) => column !== "id").map((column) => `${column} = :${column}`);
  return {
    insert: `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map((column) => `:${column}`).join(", ")})`,
    update: `UPDATE ${table} SET ${assignments.join(", ")} WHERE id = :id`,
    remove: `DELETE FROM ${table} WHERE id = :id`,
    select: `SELECT * FROM ${table}`,
  };
}

const TABLES: Record<CollectionName, TableStatements> = {
  users: tableStatements("users", ["id", "name", "time_zone", "created_at"]),
  accounts: tableStatements("accounts", [
    "id", "user_id", "email", "role", "password_verifier", "totp_secret_cipher",
    "last_totp_step", "created_at", "updated_at", "disabled_at",
  ]),
  quarters: tableStatements("quarters", [
    "id", "user_id", "title", "description", "mantra", "start_date", "end_date",
    "success_criteria", "plan_revision", "last_plan_imported_at", "intent_snapshot",
    "created_at", "updated_at",
  ]),
  focusAreas: tableStatements("focus_areas", [
    "id", "quarter_id", "name", "description", "target_minutes", "position",
    "created_at", "updated_at", "removed_from_plan_at",
  ]),
  milestones: tableStatements("milestones", [
    "id", "quarter_id", "title", "description", "start_date", "end_date", "mode",
    "position", "intent_snapshot", "created_at", "updated_at", "removed_from_plan_at",
  ]),
  tasks: tableStatements("tasks", [
    "id", "quarter_id", "focus_area_id", "milestone_id", "planned_date", "title",
    "description", "planned_minutes", "tags", "position", "recommendation_mode",
    "decision_prompt", "removed_from_plan_at", "status", "plan_snapshot",
    "continuation_of_task_id", "created_at", "updated_at",
  ]),
  // owner_user_id is insert-only (denormalized at insert, never updated).
  sessions: {
    insert:
      "INSERT INTO sessions (id, task_id, started_at, ended_at, time_zone_at_start, intention_minutes, created_at, updated_at, corrected_at, owner_user_id) VALUES (:id, :task_id, :started_at, :ended_at, :time_zone_at_start, :intention_minutes, :created_at, :updated_at, :corrected_at, :owner_user_id)",
    update:
      "UPDATE sessions SET task_id = :task_id, started_at = :started_at, ended_at = :ended_at, time_zone_at_start = :time_zone_at_start, intention_minutes = :intention_minutes, created_at = :created_at, updated_at = :updated_at, corrected_at = :corrected_at WHERE id = :id",
    remove: "DELETE FROM sessions WHERE id = :id",
    select: "SELECT * FROM sessions",
  },
  taskLifecycleEvents: tableStatements("task_lifecycle_events", [
    "id", "task_id", "sequence", "type", "occurred_at", "time_zone_at_occurrence",
    "related_task_id", "undoes_event_id", "created_at",
  ]),
  dailyReviews: tableStatements("daily_reviews", [
    "id", "task_id", "finish_event_id", "outcome", "key_learning", "reflection",
    "created_at", "updated_at",
  ]),
  journeyEntries: tableStatements("journey_entries", [
    "id", "user_id", "occurred_at", "time_zone_at_occurrence", "text", "tags",
    "related_task_id", "related_milestone_id", "related_decision_id",
    "changed_my_mind", "feeling", "created_at", "updated_at",
  ]),
  decisionRecords: tableStatements("decision_records", [
    "id", "user_id", "quarter_id", "related_task_id", "supersedes_decision_id",
    "title", "decision_date", "status", "context", "constraints_json", "options_json",
    "decision", "consequences", "assumptions_json", "falsifier", "initial_review_date",
    "created_at", "updated_at",
  ]),
  decisionReviews: tableStatements("decision_reviews", [
    "id", "decision_id", "sequence", "reviewed_at", "time_zone_at_review", "outcome",
    "notes", "next_review_date", "replacement_decision_id", "created_at",
  ]),
  aiReviews: tableStatements("ai_reviews_legacy", [
    "id", "user_id", "target_type", "target_id", "provider", "model", "summary",
    "strengths_json", "gaps_json", "suggested_follow_up", "questions_json",
    "generated_at", "time_zone_at_generation",
  ]),
  authInvites: tableStatements("auth_invites", [
    "id", "intended_email", "role", "created_by_user_id", "bootstrap", "legacy_user_id",
    "created_at", "expires_at", "consumed_at", "consumed_by_user_id", "revoked_at",
  ]),
  authSessions: tableStatements("auth_sessions", [
    "id", "account_id", "user_id", "created_at", "last_seen_at", "expires_at", "revoked_at",
  ]),
  mediaRecords: tableStatements("media_records", [
    "id", "filename", "user_id", "media_type", "byte_length", "created_at",
  ]),
  emailPreferences: tableStatements("email_preferences", [
    "id", "user_id", "digest_unsubscribed_at", "updated_at",
  ]),
};

const FTS_COLLECTIONS = new Set<CollectionName>([
  "quarters",
  "focusAreas",
  "milestones",
  "tasks",
  "journeyEntries",
  "decisionRecords",
  "decisionReviews",
]);

function toFtsCollection(name: CollectionName): FtsCollection | undefined {
  return FTS_COLLECTIONS.has(name) ? (name as FtsCollection) : undefined;
}

function parseFtsDocId(docId: string): { collection: FtsCollection; id: string } | undefined {
  const separator = docId.indexOf(":");
  if (separator <= 0) return undefined;
  const prefix = docId.slice(0, separator);
  const id = docId.slice(separator + 1);
  if (!id) return undefined;
  switch (prefix) {
    case "quarter":
      return { collection: "quarters", id };
    case "focus-area":
      return { collection: "focusAreas", id };
    case "milestone":
      return { collection: "milestones", id };
    case "task":
      return { collection: "tasks", id };
    case "journey":
      return { collection: "journeyEntries", id };
    case "decision":
      return { collection: "decisionRecords", id };
    default:
      return undefined;
  }
}

export class SqliteJourneyStore implements JourneyStore {
  private readonly directory: string;
  private readonly dbPath: string;
  private readonly markerPath: string;
  private readonly mutex = new AsyncMutex();
  private db: DatabaseSync | undefined;
  private readonly statements = new Map<string, StatementSync>();
  private diagnostics: StoreDiagnostics | undefined;

  constructor(private readonly options: SqliteJourneyStoreOptions) {
    this.directory = resolve(options.directory);
    this.dbPath = join(this.directory, DB_FILENAME);
    this.markerPath = join(this.directory, MARKER_FILENAME);
  }

  async initialize(): Promise<StoreDiagnostics> {
    const release = await this.mutex.acquire(this.options.mutexTimeoutMs ?? 5_000);
    try {
      const dirExists = await this.pathExists(this.directory);
      const dbExists = await this.pathExists(this.dbPath);
      let initialized = false;
      if (!dbExists) {
        if (!dirExists) {
          await this.createFreshStore();
          initialized = true;
        } else {
          throw new StoreError(
            "RECOVERY_REQUIRED",
            "The store directory has no SQLite primary (waypoint.db). Preserve it and recover explicitly.",
          );
        }
      }
      const marker = await this.readMarker();
      try {
        this.open();
        this.verifyAndLoad(marker);
      } catch (error) {
        this.closeQuietly();
        if (error instanceof StoreError) throw error;
        throw new StoreError("STORE_CORRUPT", "The SQLite store cannot be opened or verified.", error);
      }
      this.diagnostics = {
        initialized,
        storeId: marker.storeId,
        durability: "full",
        cleanedAbandonedTemps: [],
      };
      return this.diagnostics;
    } finally {
      release();
    }
  }

  getDiagnostics(): StoreDiagnostics {
    if (!this.diagnostics) throw new Error("The store has not been initialized.");
    return this.diagnostics;
  }

  /**
   * One-time v1 (JSON) → v2 (SQLite) import path, used only by the Phase-2
   * boot importer (ADR-0014). Creates waypoint.db inside an existing directory
   * that has no database yet, writes the full validated source state in ONE
   * transaction, and leaves the store open and verified, like initialize().
   *
   * Authority: the bulk load runs under migration authority (the
   * SCHEMA_MIGRATION side of assertJourneyStateTransition — the only intent
   * that may establish users, history, and receipts wholesale). STANDARD would
   * forbid the users change, so a normal transaction can never perform this.
   *
   * Fail-closed: an existing waypoint.db is never overwritten; a write failure
   * removes the partial database files so the next boot can retry from the
   * untouched JSON source.
   */
  async importState(source: JourneyState): Promise<StoreDiagnostics> {
    const release = await this.mutex.acquire(this.options.mutexTimeoutMs ?? 5_000);
    try {
      if (await this.pathExists(this.dbPath)) {
        throw new StoreError(
          "STORE_WRITE_FAILED",
          "The SQLite primary already exists; the JSON importer refuses to overwrite it.",
        );
      }
      assertValidState(source);
      const instant = this.options.clock.now().toISOString();
      let marker: StoreMarker;
      if (await this.pathExists(this.markerPath)) {
        marker = await this.readMarkerFile();
      } else {
        await mkdir(this.directory, { recursive: true, mode: 0o700 });
        marker = { storeId: this.options.idGenerator.generate(), createdAt: instant };
      }
      this.openAt(this.dbPath);
      const db = this.requireDb();
      try {
        db.exec(SCHEMA_SQL);
        db.exec("BEGIN IMMEDIATE");
        try {
          this.insertFullState(db, source, marker.storeId);
          db.exec("COMMIT");
        } catch (error) {
          try {
            db.exec("ROLLBACK");
          } catch {
            // Ignore; the original error carries the meaning.
          }
          throw error;
        }
      } catch (error) {
        this.closeQuietly();
        await this.removeDatabaseFiles();
        throw error instanceof StoreError
          ? error
          : new StoreError("STORE_WRITE_FAILED", "The JSON import could not be committed; no partial database was kept.", error);
      }
      await chmod(this.dbPath, 0o600);
      if (!(await this.pathExists(this.markerPath))) {
        await writeFile(this.markerPath, `${JSON.stringify(marker, null, 2)}\n`, { mode: 0o600, flag: "wx" });
        await chmod(this.markerPath, 0o600);
      }
      this.verifyAndLoad(marker);
      this.diagnostics = {
        initialized: true,
        storeId: marker.storeId,
        durability: "full",
        cleanedAbandonedTemps: [],
      };
      return this.diagnostics;
    } finally {
      release();
    }
  }

  close(): void {
    this.statements.clear();
    if (this.db) {
      this.db.close();
      this.db = undefined;
    }
  }

  async read<T>(project: (state: JourneyState) => T): Promise<T> {
    this.assertInitialized();
    const db = this.requireDb();
    db.exec("BEGIN");
    try {
      const state = deepFreeze(this.materialize(db)) as JourneyState;
      db.exec("COMMIT");
      return clone(project(state));
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // No active read transaction; the original error carries the meaning.
      }
      throw error;
    }
  }

  async transact<T>(
    intent: TransactionIntent,
    mutate: (draft: JourneyState) => Mutation<T>,
  ): Promise<TransactionResult<T>> {
    this.assertInitialized();
    const release = await this.mutex.acquire(this.options.mutexTimeoutMs ?? 5_000);
    const db = this.requireDb();
    try {
      return this.transactSync(db, intent, mutate);
    } finally {
      release();
    }
  }

  private transactSync<T>(
    db: DatabaseSync,
    intent: TransactionIntent,
    mutate: (draft: JourneyState) => Mutation<T>,
  ): TransactionResult<T> {
    try {
      db.exec("BEGIN IMMEDIATE");
    } catch (error) {
      if (isBusyError(error)) throw new StoreError("STORE_BUSY", "The local store is busy. Try again.", error);
      throw error;
    }
    const rollbackQuietly = (): void => {
      try {
        db.exec("ROLLBACK");
      } catch {
        // Already rolled back or no transaction; the original error wins.
      }
    };

    // Phase 1: load + mutate. Mutate errors (e.g. idempotency conflicts from
    // application services) propagate untouched, exactly like the JSON store.
    let before: JourneyState;
    let draft: JourneyState;
    let mutation: Mutation<T>;
    try {
      before = this.materialize(db);
      assertValidState(before);
      draft = clone(before);
      mutation = mutate(draft);
    } catch (error) {
      rollbackQuietly();
      if (isBusyError(error)) throw new StoreError("STORE_BUSY", "The local store is busy. Try again.", error);
      throw error;
    }

    if (mutation.kind === "no-change") {
      rollbackQuietly();
      return deepFreeze({
        value: clone(mutation.value),
        state: clone(before),
        changed: false,
      }) as TransactionResult<T>;
    }

    // Phase 2: validate + write. Pre-commit failure leaves the prior state
    // authoritative (STORE_WRITE_FAILED); post-commit failure is uncertain.
    let committed = false;
    try {
      draft.storeRevision = before.storeRevision + 1;
      draft.writtenAt = this.options.clock.now().toISOString();
      assertValidState(draft);
      assertJourneyStateTransition(before, draft, intent);
      this.writeDiff(db, before, draft);
      this.options.failpoint?.("before-commit");
      db.exec("COMMIT");
      committed = true;
      this.options.failpoint?.("after-commit");
    } catch (error) {
      if (!committed) rollbackQuietly();
      if (error instanceof StoreError) throw error;
      if (committed) {
        throw new StoreError(
          "STORE_DURABILITY_UNCERTAIN",
          "The change may have committed. Retry the identical command key.",
          error,
        );
      }
      if (isBusyError(error)) throw new StoreError("STORE_BUSY", "The local store is busy. Try again.", error);
      throw new StoreError(
        "STORE_WRITE_FAILED",
        "The local store could not be written; the prior state remains authoritative.",
        error,
      );
    }
    return deepFreeze({
      value: clone(mutation.value),
      state: clone(draft),
      changed: true,
    }) as TransactionResult<T>;
  }

  private assertInitialized(): void {
    if (!this.diagnostics) throw new Error("Call initialize() before using the store.");
    if (!this.db) throw new Error("The store database is not open.");
  }

  private requireDb(): DatabaseSync {
    const db = this.db;
    if (!db) throw new Error("The store database is not open.");
    return db;
  }

  private prepare(db: DatabaseSync, sql: string): StatementSync {
    const cached = this.statements.get(sql);
    if (cached) return cached;
    const statement = db.prepare(sql);
    this.statements.set(sql, statement);
    return statement;
  }

  private open(): void {
    this.openAt(this.dbPath);
  }

  private openAt(path: string): void {
    this.closeQuietly();
    const db = new DatabaseSync(path);
    db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
    this.db = db;
  }

  private closeQuietly(): void {
    this.statements.clear();
    try {
      this.db?.close();
    } catch {
      // Best effort during failure paths.
    }
    this.db = undefined;
  }

  private verifyAndLoad(marker: StoreMarker): void {
    const db = this.requireDb();
    const integrity = this.prepare(db, "PRAGMA integrity_check").all() as Row[];
    if (integrity.length !== 1 || integrity[0]?.["integrity_check"] !== "ok") {
      throw new StoreError("STORE_CORRUPT", "The SQLite integrity check failed. Preserve all artifacts.");
    }
    const fkViolations = this.prepare(db, "PRAGMA foreign_key_check").all();
    if (fkViolations.length > 0) {
      throw new StoreError("STORE_CORRUPT", "The SQLite foreign-key check failed. Preserve all artifacts.");
    }
    const meta = this.readMeta(db);
    if (meta.get("schema_version") !== "1") {
      throw new StoreError(
        "STORE_SCHEMA_UNSUPPORTED",
        "The store uses an unsupported schema version. Preserve it and upgrade the app.",
      );
    }
    if ((meta.get("store_id") ?? "") !== marker.storeId) {
      throw new StoreError(
        "RECOVERY_REQUIRED",
        "The SQLite store id does not match the authority marker. Preserve everything and recover explicitly.",
      );
    }
    assertValidState(this.materialize(db));
  }

  private readMeta(db: DatabaseSync): Map<string, string> {
    const rows = this.prepare(db, "SELECT key, value FROM meta").all() as Row[];
    const meta = new Map<string, string>();
    for (const row of rows) {
      const key = row["key"];
      const value = row["value"];
      if (typeof key === "string" && typeof value === "string") meta.set(key, value);
    }
    return meta;
  }

  private async createFreshStore(): Promise<void> {
    const parent = dirname(this.directory);
    const prefix = `.${basename(this.directory)}.init-`;
    await mkdir(parent, { recursive: true, mode: 0o700 });
    const siblings = await readdir(parent);
    const abandoned = siblings.filter((name) => name.startsWith(prefix));
    if (abandoned.length > 0) {
      throw new StoreError(
        "RECOVERY_REQUIRED",
        `Interrupted initialization found: ${abandoned.join(", ")}. Preserve it and recover explicitly.`,
      );
    }

    const instant = this.options.clock.now().toISOString();
    const initDirectory = join(parent, `${prefix}${this.options.idGenerator.generate()}`);
    await mkdir(initDirectory, { mode: 0o700 });
    const marker: StoreMarker = {
      storeId: this.options.idGenerator.generate(),
      createdAt: instant,
    };
    const seed = this.options.seed(instant);
    assertValidState(seed);
    // Seed inside the sibling directory, then atomically rename it into
    // place — the same one-winner protocol as the JSON store.
    this.openAt(join(initDirectory, DB_FILENAME));
    const db = this.requireDb();
    try {
      db.exec(SCHEMA_SQL);
      db.exec("BEGIN IMMEDIATE");
      try {
        this.insertFullState(db, seed, marker.storeId);
        db.exec("COMMIT");
      } catch (error) {
        try {
          db.exec("ROLLBACK");
        } catch {
          // Ignore; the original error carries the meaning.
        }
        throw error;
      }
    } catch (error) {
      this.closeQuietly();
      throw error instanceof StoreError
        ? error
        : new StoreError("STORE_WRITE_FAILED", "The fresh SQLite store could not be seeded.", error);
    }
    this.closeQuietly();
    const initDbPath = join(initDirectory, DB_FILENAME);
    const initMarkerPath = join(initDirectory, MARKER_FILENAME);
    await chmod(initDbPath, 0o600);
    await writeFile(initMarkerPath, `${JSON.stringify(marker, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    await chmod(initMarkerPath, 0o600);
    try {
      await rename(initDirectory, this.directory);
    } catch (error) {
      if (await this.pathExists(this.directory)) {
        await rm(initDirectory, { recursive: true, force: true });
        return;
      }
      throw new StoreError(
        "RECOVERY_REQUIRED",
        `Initialization stopped before the store became authoritative. Preserve ${initDirectory}.`,
        error,
      );
    }
  }

  private async readMarker(): Promise<StoreMarker> {
    if (!(await this.pathExists(this.markerPath))) {
      throw new StoreError(
        "RECOVERY_REQUIRED",
        "The store directory has no authority marker. Preserve it and recover explicitly.",
      );
    }
    if (!(await this.pathExists(this.dbPath))) {
      throw new StoreError(
        "RECOVERY_REQUIRED",
        "The marked store has no primary database. Preserve all artifacts and recover explicitly.",
      );
    }
    return this.readMarkerFile();
  }

  private async readMarkerFile(): Promise<StoreMarker> {
    let marker: unknown;
    try {
      marker = parseJson(await readFile(this.markerPath, "utf8"), "The store marker");
    } catch (error) {
      throw new StoreError("RECOVERY_REQUIRED", "The store authority marker is invalid.", error);
    }
    if (
      !marker ||
      typeof marker !== "object" ||
      !("storeId" in marker) ||
      typeof marker.storeId !== "string" ||
      marker.storeId.length === 0 ||
      !("createdAt" in marker) ||
      typeof marker.createdAt !== "string" ||
      Number.isNaN(new Date(marker.createdAt).valueOf())
    ) {
      throw new StoreError("RECOVERY_REQUIRED", "The store authority marker is invalid.");
    }
    return { storeId: marker.storeId, createdAt: marker.createdAt };
  }

  private async removeDatabaseFiles(): Promise<void> {
    await rm(this.dbPath, { force: true });
    await rm(`${this.dbPath}-wal`, { force: true });
    await rm(`${this.dbPath}-shm`, { force: true });
  }

  private materialize(db: DatabaseSync): JourneyState {
    const selectAll = (sql: string): Row[] => this.prepare(db, sql).all() as Row[];
    const users = selectAll(TABLES.users.select).map(rowToUser);
    const quarters = selectAll(TABLES.quarters.select).map(rowToQuarter);
    const focusAreas = selectAll(TABLES.focusAreas.select).map(rowToFocusArea);
    const milestones = selectAll(TABLES.milestones.select).map(rowToMilestone);
    const tasks = selectAll(TABLES.tasks.select).map(rowToTask);
    const sessions = selectAll(TABLES.sessions.select).map(rowToSession);
    const lifecycleEvents = selectAll(TABLES.taskLifecycleEvents.select).map(rowToLifecycleEvent);
    const dailyReviews = selectAll(TABLES.dailyReviews.select).map(rowToDailyReview);
    const journeyEntries = selectAll(TABLES.journeyEntries.select).map(rowToJourneyEntry);
    const decisionRecords = selectAll(TABLES.decisionRecords.select).map(rowToDecision);
    const decisionReviews = selectAll(TABLES.decisionReviews.select).map(rowToDecisionReview);
    const aiReviews = selectAll(TABLES.aiReviews.select).map(rowToAiReview);
    const accounts = selectAll(TABLES.accounts.select).map(rowToAccount);
    const authInvites = selectAll(TABLES.authInvites.select).map(rowToAuthInvite);
    const authSessions = selectAll(TABLES.authSessions.select).map(rowToAuthSession);
    const mediaRecords = selectAll(TABLES.mediaRecords.select).map(rowToMediaRecord);
    const emailPreferences = selectAll(TABLES.emailPreferences.select).map(rowToEmailPreference);

    const meta = this.readMeta(db);
    const storeRevision = Number(meta.get("store_revision") ?? Number.NaN);
    const writtenAt = meta.get("written_at") ?? "";

    const keyById = <R extends { id: string }>(records: readonly R[]): Record<string, R> =>
      Object.fromEntries(records.map((record) => [record.id, record]));
    const state: JourneyState = {
      schemaVersion: 1,
      storeRevision: Number.isInteger(storeRevision) ? storeRevision : 0,
      writtenAt,
      records: {
        users: keyById(users),
        quarters: keyById(quarters),
        focusAreas: keyById(focusAreas),
        milestones: keyById(milestones),
        tasks: keyById(tasks),
        sessions: keyById(sessions),
        taskLifecycleEvents: keyById(lifecycleEvents),
        dailyReviews: keyById(dailyReviews),
        journeyEntries: keyById(journeyEntries),
        decisionRecords: keyById(decisionRecords),
        decisionReviews: keyById(decisionReviews),
        aiReviews: keyById(aiReviews),
      },
      commandReceipts: {},
    };
    // Mirror the JSON shape: optional collections are absent while empty.
    if (accounts.length > 0) state.records.accounts = keyById(accounts);
    if (authInvites.length > 0) state.records.authInvites = keyById(authInvites);
    if (authSessions.length > 0) state.records.authSessions = keyById(authSessions);
    if (mediaRecords.length > 0) state.records.mediaRecords = keyById(mediaRecords);
    if (emailPreferences.length > 0) state.records.emailPreferences = keyById(emailPreferences);

    const receiptRows = selectAll(
      "SELECT user_id, key, method, route, request_fingerprint, result_json, committed_store_revision, created_at FROM command_receipts",
    );
    for (const row of receiptRows) {
      const receipt = rowToReceipt(row);
      state.commandReceipts[receiptMapKey(receipt.userId, receipt.key)] = receipt;
    }
    return state;
  }

  private insertFullState(db: DatabaseSync, state: JourneyState, storeId: string): void {
    const empty: JourneyState = {
      schemaVersion: 1,
      storeRevision: 0,
      writtenAt: state.writtenAt,
      records: {
        users: {},
        quarters: {},
        focusAreas: {},
        milestones: {},
        tasks: {},
        sessions: {},
        taskLifecycleEvents: {},
        dailyReviews: {},
        journeyEntries: {},
        decisionRecords: {},
        decisionReviews: {},
        aiReviews: {},
      },
      commandReceipts: {},
    };
    const putMeta = this.prepare(db, "INSERT INTO meta (key, value) VALUES (:key, :value)");
    putMeta.run({ key: "schema_version", value: "1" });
    putMeta.run({ key: "store_revision", value: String(state.storeRevision) });
    putMeta.run({ key: "written_at", value: state.writtenAt });
    putMeta.run({ key: "store_id", value: storeId });
    this.writeDiff(db, empty, state);
  }

  private writeDiff(db: DatabaseSync, before: JourneyState, after: JourneyState): void {
    const changedFts = new Map<FtsCollection, Set<string>>();
    const touchFts = (collection: CollectionName, id: string): void => {
      const ftsCollection = toFtsCollection(collection);
      if (!ftsCollection) return;
      let ids = changedFts.get(ftsCollection);
      if (!ids) {
        ids = new Set<string>();
        changedFts.set(ftsCollection, ids);
      }
      ids.add(id);
    };

    // Insert + update pass in FK dependency order (parents before children).
    for (const collection of WRITE_ORDER) {
      const beforeMap = (before.records[collection] ?? {}) as Record<string, never>;
      const afterMap = (after.records[collection] ?? {}) as Record<string, never>;
      const statements = TABLES[collection];
      const insert = this.prepare(db, statements.insert);
      const update = this.prepare(db, statements.update);
      for (const [id, record] of Object.entries(afterMap)) {
        const prior = beforeMap[id];
        if (prior === undefined) {
          insert.run(this.recordToRow(collection, after, record));
          touchFts(collection, id);
        } else if (!equalJson(prior, record)) {
          const params = this.recordToRow(collection, after, record);
          // sessions.owner_user_id is insert-only (TABLES.sessions/update has
          // no such placeholder); strip it so interval corrections can commit.
          if (collection === "sessions") delete params.owner_user_id;
          update.run(params);
          touchFts(collection, id);
        }
      }
    }

    // Receipts: same id-set diff over the `${userId}:${key}` map keys.
    const receiptInsert = this.prepare(
      db,
      "INSERT INTO command_receipts (user_id, key, method, route, request_fingerprint, result_json, committed_store_revision, created_at) VALUES (:user_id, :key, :method, :route, :request_fingerprint, :result_json, :committed_store_revision, :created_at)",
    );
    for (const [mapKey, receipt] of Object.entries(after.commandReceipts)) {
      const prior = before.commandReceipts[mapKey];
      if (prior === undefined) receiptInsert.run(receiptToRow(receipt));
      // Receipts are immutable; the transition policy rejects any edit.
    }

    // Delete pass in reverse dependency order (children before parents).
    for (const collection of [...WRITE_ORDER].reverse()) {
      const beforeMap = (before.records[collection] ?? {}) as Record<string, unknown>;
      const afterMap = (after.records[collection] ?? {}) as Record<string, unknown>;
      const remove = this.prepare(db, TABLES[collection].remove);
      for (const id of Object.keys(beforeMap)) {
        if (!(id in afterMap)) {
          remove.run({ id });
          touchFts(collection, id);
        }
      }
    }
    const receiptRemove = this.prepare(
      db,
      "DELETE FROM command_receipts WHERE user_id = :user_id AND key = :key",
    );
    for (const mapKey of Object.keys(before.commandReceipts)) {
      if (!(mapKey in after.commandReceipts)) {
        const separator = mapKey.indexOf(":");
        receiptRemove.run({ user_id: mapKey.slice(0, separator), key: mapKey.slice(separator + 1) });
      }
    }

    // Header switch + FTS maintenance, still inside the same transaction.
    const setMeta = this.prepare(db, "UPDATE meta SET value = :value WHERE key = :key");
    setMeta.run({ key: "store_revision", value: String(after.storeRevision) });
    setMeta.run({ key: "written_at", value: after.writtenAt });
    this.writeFtsDocs(db, before, after, changedFts);
  }

  private recordToRow(
    collection: CollectionName,
    after: JourneyState,
    record: never,
  ): RowParams {
    switch (collection) {
      case "users":
        return userToRow(record as JourneyState["records"]["users"][string]);
      case "accounts":
        return accountToRow(record as NonNullable<JourneyState["records"]["accounts"]>[string]);
      case "quarters":
        return quarterToRow(record as JourneyState["records"]["quarters"][string]);
      case "focusAreas":
        return focusAreaToRow(record as JourneyState["records"]["focusAreas"][string]);
      case "milestones":
        return milestoneToRow(record as JourneyState["records"]["milestones"][string]);
      case "tasks":
        return taskToRow(record as JourneyState["records"]["tasks"][string]);
      case "sessions": {
        const session = record as JourneyState["records"]["sessions"][string];
        const task = after.records.tasks[session.taskId];
        const quarter = task ? after.records.quarters[task.quarterId] : undefined;
        if (!quarter) throw new StoreError("STORE_CORRUPT", "Cannot resolve a session owner from its task quarter.");
        return sessionToRow(session, quarter.userId);
      }
      case "taskLifecycleEvents":
        return lifecycleEventToRow(record as JourneyState["records"]["taskLifecycleEvents"][string]);
      case "dailyReviews":
        return dailyReviewToRow(record as JourneyState["records"]["dailyReviews"][string]);
      case "journeyEntries":
        return journeyEntryToRow(record as JourneyState["records"]["journeyEntries"][string]);
      case "decisionRecords":
        return decisionToRow(record as JourneyState["records"]["decisionRecords"][string]);
      case "decisionReviews":
        return decisionReviewToRow(record as JourneyState["records"]["decisionReviews"][string]);
      case "aiReviews":
        return aiReviewToRow(record as JourneyState["records"]["aiReviews"][string]);
      case "authInvites":
        return authInviteToRow(record as NonNullable<JourneyState["records"]["authInvites"]>[string]);
      case "authSessions":
        return authSessionToRow(record as NonNullable<JourneyState["records"]["authSessions"]>[string]);
      case "mediaRecords":
        return mediaRecordToRow(record as NonNullable<JourneyState["records"]["mediaRecords"]>[string]);
      case "emailPreferences":
        return emailPreferenceToRow(record as NonNullable<JourneyState["records"]["emailPreferences"]>[string]);
      default:
        throw new StoreError("STORE_CORRUPT", `Unhandled collection ${collection} in the SQLite diff writer.`);
    }
  }

  private writeFtsDocs(
    db: DatabaseSync,
    before: JourneyState,
    after: JourneyState,
    changed: ChangedIds,
  ): void {
    if (changed.size === 0) return;
    const remove = this.prepare(db, "DELETE FROM search_docs WHERE doc_id = :doc_id");
    const insert = this.prepare(
      db,
      "INSERT INTO search_docs (doc_id, user_id, quarter_id, group_type, content_type, occurred_at, title, body) VALUES (:doc_id, :user_id, :quarter_id, :group_type, :content_type, :occurred_at, :title, :body)",
    );
    for (const docId of collectAffectedFtsDocIds(before, after, changed)) {
      remove.run({ doc_id: docId });
      const parsed = parseFtsDocId(docId);
      if (!parsed) continue;
      const doc = composeFtsDocForRecord(after, parsed.collection, parsed.id);
      if (!doc) continue;
      insert.run({
        doc_id: doc.docId,
        user_id: doc.userId,
        quarter_id: doc.quarterId,
        group_type: doc.groupType,
        content_type: doc.contentType,
        occurred_at: doc.occurredAt,
        title: doc.title,
        body: doc.body,
      });
    }
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }
}
