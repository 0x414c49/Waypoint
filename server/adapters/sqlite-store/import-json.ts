// One-time v1 (JSON) → v2 (SQLite) boot importer (ADR-0014 consequences).
//
// Boot logic (see server/boot-store.ts):
//   - waypoint.db exists → open SQLite, verify, serve (leftover JSON ignored).
//   - waypoint.db missing + journey-state.json exists → import here BEFORE
//     listening: validate source fail-closed, copy the source to a timestamped
//     pre-sqlite backup, bulk-load in one transaction, verify, then serve.
//   - neither exists → fresh SQLite init with the production seed.
// The source JSON is never deleted or overwritten by the importer.
//
// Media decision (ADR-0015 vs Phase-1 compat table): the SQLite schema keeps a
// media_records table, and the importer MIGRATES mediaRecords rows into it for
// forensic completeness — but no API serves them and no new rows can be
// written (mediaRecords is absent from the AUTHENTICATION transition set, and
// journey-state-schema.ts keeps it Optional only so old JSON still validates).
// Filenames referenced by old /api/media/… entry text are collected into a
// media-orphans.json report next to the backup for manual re-hosting.

import { DatabaseSync } from "node:sqlite";
import { chmod, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { searchRecords } from "../../application/search/search.js";
import type { JourneyState } from "../../domain/journey-state.js";
import type { Clock } from "../../ports/clock.js";
import type { IdGenerator } from "../../ports/id-generator.js";
import { assertValidState, equalJson, parseJson } from "../state-codec.js";
import { StoreError } from "../store-errors.js";
import type { StoreDiagnostics } from "../store-types.js";
import { SqliteJourneyStore } from "./sqlite-journey-store.js";

const DB_FILENAME = "waypoint.db";
const SOURCE_FILENAME = "journey-state.json";
const ORPHANS_FILENAME = "media-orphans.json";

export type BootMode = "sqlite" | "migrate" | "fresh";

/** Pure boot selection: which store path to take. Tested without listening. */
export function selectBootMode(dbExists: boolean, jsonExists: boolean): BootMode {
  if (dbExists) return "sqlite";
  if (jsonExists) return "migrate";
  return "fresh";
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function resolveBootMode(directory: string): Promise<BootMode> {
  const resolved = resolve(directory);
  const [dbExists, jsonExists] = await Promise.all([
    pathExists(join(resolved, DB_FILENAME)),
    pathExists(join(resolved, SOURCE_FILENAME)),
  ]);
  return selectBootMode(dbExists, jsonExists);
}

export interface MediaOrphanFile {
  readonly filename: string;
  readonly userId: string;
  readonly mediaType: string;
  readonly byteLength: number;
}

export interface MediaOrphanReference {
  readonly entryId: string;
  readonly kind: "journeyEntry" | "decisionRecord" | "decisionReview";
  readonly filename: string;
}

export interface MediaOrphansReport {
  readonly generatedAt: string;
  readonly note: string;
  readonly mediaRecords: readonly MediaOrphanFile[];
  readonly references: readonly MediaOrphanReference[];
}

const MEDIA_REF_PATTERN = /\/api\/media\/([A-Za-z0-9][A-Za-z0-9._-]{0,126}\.(?:png|jpe?g|gif|webp))/g;

function findMediaRefs(text: string | undefined): string[] {
  if (!text) return [];
  const found: string[] = [];
  for (const match of text.matchAll(MEDIA_REF_PATTERN)) {
    if (match[1] && !found.includes(match[1])) found.push(match[1]);
  }
  return found;
}

/** Filenames the operator must re-host or delete manually (ADR-0015). */
export function collectMediaOrphans(state: JourneyState, generatedAt: string): MediaOrphansReport | undefined {
  const mediaRecords: MediaOrphanFile[] = Object.values(state.records.mediaRecords ?? {}).map((record) => ({
    filename: record.filename,
    userId: record.userId,
    mediaType: record.mediaType,
    byteLength: record.byteLength,
  }));
  const references: MediaOrphanReference[] = [];
  for (const entry of Object.values(state.records.journeyEntries)) {
    for (const filename of findMediaRefs(entry.text)) {
      references.push({ entryId: entry.id, kind: "journeyEntry", filename });
    }
  }
  for (const decision of Object.values(state.records.decisionRecords)) {
    for (const field of [decision.context, decision.decision, decision.consequences] as const) {
      for (const filename of findMediaRefs(field ?? undefined)) {
        references.push({ entryId: decision.id, kind: "decisionRecord", filename });
      }
    }
  }
  for (const review of Object.values(state.records.decisionReviews)) {
    for (const filename of findMediaRefs(review.notes ?? undefined)) {
      references.push({ entryId: review.id, kind: "decisionReview", filename });
    }
  }
  if (mediaRecords.length === 0 && references.length === 0) return undefined;
  return {
    generatedAt,
    note: "Binary media upload was removed (ADR-0015): /api/media is gone and these files are no longer served. mediaRecords rows were preserved in the media_records table for forensic completeness but no API serves them. Re-host each referenced image and update the entry text, or delete the reference.",
    mediaRecords,
    references,
  };
}

const OPTIONAL_COLLECTIONS = ["accounts", "authInvites", "authSessions", "mediaRecords", "emailPreferences"] as const;

/**
 * Mirror the SQLite materialize shape (optional collections are absent while
 * empty) so a byte-faithful import compares equal even when the JSON source
 * carries explicit empty maps.
 */
function normalizeForComparison(source: JourneyState): JourneyState {
  const records: JourneyState["records"] = { ...source.records };
  for (const name of OPTIONAL_COLLECTIONS) {
    if (records[name] && Object.keys(records[name]).length === 0) {
      delete records[name];
    }
  }
  return { ...source, records };
}

export interface ImportCounts {
  readonly perCollection: Record<string, number>;
  readonly receipts: number;
  readonly storeRevision: number;
}

/** Fixed verification sample: 6 queries covering plan, journey, and decision text. */
export const SEARCH_PARITY_QUERIES = ["the", "plan", "2026", "review", "task", "learning"] as const;

function searchIdSet(state: JourneyState, userId: string, query: string): string[] {
  const result = searchRecords(state, userId, { query, limit: 100 });
  return [...new Set(result.groups.flatMap((group) => group.items.map((item) => item.id)))].sort();
}

function verifyImport(dbPath: string, source: JourneyState, target: JourneyState): ImportCounts {
  const normalized = normalizeForComparison(source);
  const perCollection: Record<string, number> = {};
  for (const [name, map] of Object.entries(normalized.records)) {
    const expected = Object.keys(map as Record<string, unknown>).length;
    const actual = Object.keys((target.records as Record<string, unknown>)[name] as Record<string, unknown> ?? {}).length;
    if (expected !== actual) {
      throw new StoreError("STORE_CORRUPT", `Import verification failed: collection ${name} has ${actual} rows, expected ${expected}.`);
    }
    perCollection[name] = actual;
  }
  if (target.storeRevision !== source.storeRevision) {
    throw new StoreError("STORE_CORRUPT", `Import verification failed: storeRevision ${target.storeRevision} != source ${source.storeRevision}.`);
  }
  if (!equalJson(normalized, target)) {
    throw new StoreError("STORE_CORRUPT", "Import verification failed: the materialized state differs from the JSON source (receipts included).");
  }
  const probe = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const integrity = probe.prepare("PRAGMA integrity_check").all() as Array<{ integrity_check?: unknown }>;
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== "ok") {
      throw new StoreError("STORE_CORRUPT", "Import verification failed: SQLite integrity_check did not return ok.");
    }
    const fkViolations = probe.prepare("PRAGMA foreign_key_check").all();
    if (fkViolations.length > 0) {
      throw new StoreError("STORE_CORRUPT", "Import verification failed: SQLite foreign_key_check found violations.");
    }
    const doubles = probe
      .prepare("SELECT owner_user_id FROM sessions WHERE ended_at IS NULL GROUP BY owner_user_id HAVING COUNT(*) > 1")
      .all();
    if (doubles.length > 0) {
      throw new StoreError("STORE_CORRUPT", "Import verification failed: more than one active session exists for a user.");
    }
  } finally {
    probe.close();
  }
  for (const userId of Object.keys(source.records.users)) {
    for (const query of SEARCH_PARITY_QUERIES) {
      const expected = searchIdSet(normalized, userId, query);
      const actual = searchIdSet(target, userId, query);
      if (!equalJson(expected, actual)) {
        throw new StoreError("STORE_CORRUPT", `Import verification failed: search parity diverged for query "${query}".`);
      }
    }
  }
  return { perCollection, receipts: Object.keys(target.commandReceipts).length, storeRevision: target.storeRevision };
}

async function writeBackupOnce(directory: string, baseName: string, contents: string): Promise<string> {
  for (let attempt = 0; ; attempt += 1) {
    const name = attempt === 0 ? baseName : baseName.replace(/\.json$/, `-${attempt + 1}.json`);
    const path = join(directory, name);
    try {
      await writeFile(path, contents, { mode: 0o600, flag: "wx" });
      await chmod(path, 0o600);
      return path;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      // Idempotent retry: a previous attempt already froze this exact source.
      const existing = await readFile(path, "utf8").catch(() => undefined);
      if (existing === contents) return path;
    }
  }
}

export interface ImportDependencies {
  readonly directory: string;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
}

export interface ImportSummary {
  readonly store: SqliteJourneyStore;
  readonly diagnostics: StoreDiagnostics;
  readonly backupPath: string;
  readonly orphansPath: string | undefined;
  readonly counts: ImportCounts;
  readonly searchParityQueries: number;
}

export async function importJsonDirectory(dependencies: ImportDependencies): Promise<ImportSummary> {
  const directory = resolve(dependencies.directory);
  const dbPath = join(directory, DB_FILENAME);
  const sourcePath = join(directory, SOURCE_FILENAME);
  if (await pathExists(dbPath)) {
    throw new StoreError("STORE_WRITE_FAILED", "The SQLite primary already exists; refusing to re-import over it.");
  }
  let raw: string;
  try {
    raw = await readFile(sourcePath, "utf8");
  } catch (error) {
    throw new StoreError("STORE_CORRUPT", "The JSON source cannot be read; everything was preserved.", error);
  }
  const parsed = parseJson(raw, SOURCE_FILENAME);
  assertValidState(parsed);
  const source = parsed;
  const instant = dependencies.clock.now().toISOString();
  const backupPath = await writeBackupOnce(
    directory,
    `journey-state.pre-sqlite-${instant.replace(/[:.]/g, "-")}.json`,
    raw,
  );
  const orphans = collectMediaOrphans(source, instant);
  let orphansPath: string | undefined;
  if (orphans) {
    orphansPath = join(directory, ORPHANS_FILENAME);
    await writeFile(orphansPath, `${JSON.stringify(orphans, null, 2)}\n`, { mode: 0o600 });
    await chmod(orphansPath, 0o600);
  }
  const store = new SqliteJourneyStore({
    directory,
    clock: dependencies.clock,
    idGenerator: dependencies.idGenerator,
    // The importer writes the validated source state directly; no seed is used.
    seed: () => {
      throw new Error("The JSON importer never seeds a fresh store.");
    },
  });
  const diagnostics = await store.importState(source);
  try {
    const counts = verifyImport(dbPath, source, await store.read((state) => state));
    return { store, diagnostics, backupPath, orphansPath, counts, searchParityQueries: SEARCH_PARITY_QUERIES.length };
  } catch (error) {
    // Failed verification: drop the suspect database so the next boot retries
    // from the untouched JSON source + backup. The source and backup stay.
    store.close();
    await rm(dbPath, { force: true });
    await rm(`${dbPath}-wal`, { force: true });
    await rm(`${dbPath}-shm`, { force: true });
    throw error;
  }
}
