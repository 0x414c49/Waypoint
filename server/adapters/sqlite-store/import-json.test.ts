// @vitest-environment node
// Phase-2 boot migration tests (ADR-0014 auto-migration, ADR-0015 orphans).
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { bootJourneyStore } from "../../boot-store.js";
import { captureTaskPlanContext } from "../../application/history/capture-plan-context.js";
import { searchRecords } from "../../application/search/search.js";
import { createNoHistorySeed, type JourneyState } from "../../domain/journey-state.js";
import { createProductionSeed } from "../../domain/production-seed.js";
import { FixedClock } from "../../ports/clock.js";
import { RandomIdGenerator, SequenceIdGenerator } from "../../ports/id-generator.js";
import { STANDARD_INTENT } from "../../ports/journey-store.js";
import { StoreError } from "../store-errors.js";
import { equalJson, serializeJourneyState } from "../state-codec.js";
import {
  collectMediaOrphans,
  importJsonDirectory,
  SEARCH_PARITY_QUERIES,
  selectBootMode,
} from "./import-json.js";
import { SqliteJourneyStore } from "./sqlite-journey-store.js";

const roots: string[] = [];
const instant = new Date("2026-09-27T10:00:00.000Z");
const at = instant.toISOString();
const later = new Date("2026-09-27T10:30:00.000Z").toISOString();
const execFileAsync = promisify(execFile);

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "import-json-test-"));
  roots.push(root);
  return root;
}

/** Rich source covering every collection: plan, execution, auth, receipts, email prefs, legacy AI + media rows. */
async function buildRichSource(): Promise<{ source: JourneyState; raw: string }> {
  const root = await tempRoot();
  const builder = new SqliteJourneyStore({
    directory: join(root, "builder"),
    clock: new FixedClock(instant),
    idGenerator: new RandomIdGenerator(),
    seed: createProductionSeed,
  });
  await builder.initialize();
  const taskIds = await builder.read((state) => Object.keys(state.records.tasks));
  const finishedTaskId = taskIds[0]!;
  const sessionTaskId = taskIds[1] ?? taskIds[0]!;

  await builder.transact(STANDARD_INTENT, (draft) => {
    // Capture plan context exactly like the task commands do: history
    // requires the immutable snapshots once a task is touched.
    captureTaskPlanContext(draft, draft.records.tasks[finishedTaskId]!, "Europe/Amsterdam", at);
    captureTaskPlanContext(draft, draft.records.tasks[sessionTaskId]!, "Europe/Amsterdam", at);
    draft.records.tasks[finishedTaskId]!.status = "FINISHED";
    draft.records.tasks[finishedTaskId]!.updatedAt = at;
    draft.records.taskLifecycleEvents["evt-finish-1"] = {
      id: "evt-finish-1",
      taskId: finishedTaskId,
      sequence: 1,
      type: "FINISHED",
      occurredAt: at,
      timeZoneAtOccurrence: "Europe/Amsterdam",
      createdAt: at,
    };
    draft.records.dailyReviews["review-1"] = {
      id: "review-1",
      taskId: finishedTaskId,
      finishEventId: "evt-finish-1",
      outcome: "ACHIEVED",
      keyLearning: "Small slices keep the learning loop honest",
      createdAt: at,
      updatedAt: at,
    };
    draft.records.tasks[sessionTaskId]!.status = "PAUSED";
    draft.records.tasks[sessionTaskId]!.updatedAt = at;
    draft.records.sessions["session-1"] = {
      id: "session-1",
      taskId: sessionTaskId,
      startedAt: at,
      endedAt: later,
      timeZoneAtStart: "Europe/Amsterdam",
      createdAt: at,
      updatedAt: later,
    };
    draft.records.journeyEntries["entry-1"] = {
      id: "entry-1",
      userId: "local-user",
      occurredAt: at,
      timeZoneAtOccurrence: "Europe/Amsterdam",
      text: "Learning plan notes with an old inline image /api/media/image-aaa.png for the quarterly review task",
      tags: ["learning"],
      feeling: "curious",
      changedMyMind: false,
      createdAt: at,
    };
    draft.records.journeyEntries["entry-2"] = {
      id: "entry-2",
      userId: "local-user",
      occurredAt: at,
      timeZoneAtOccurrence: "Europe/Amsterdam",
      text: "A second thought about steady progress",
      tags: [],
      changedMyMind: false,
      createdAt: at,
    };
    draft.records.decisionRecords["decision-1"] = {
      id: "decision-1",
      userId: "local-user",
      title: "Use SQLite for the local store",
      status: "ACCEPTED",
      context: "The JSON file needs indexes",
      decisionDate: "2026-09-27",
      decision: "Adopt plain SQLite with FTS",
      constraints: ["Keep it simple"],
      options: [
        {
          id: "opt-1",
          title: "SQLite",
          description: "Plain SQLite with FTS",
          strengths: ["No server"],
          weaknesses: ["New code"],
        },
      ],
      assumptions: ["Single user"],
      createdAt: at,
      updatedAt: at,
    };
    draft.records.decisionReviews["drev-1"] = {
      id: "drev-1",
      decisionId: "decision-1",
      sequence: 1,
      reviewedAt: at,
      timeZoneAtReview: "Europe/Amsterdam",
      outcome: "HOLDS",
      notes: "Still holds after the learning review",
      createdAt: at,
    };
    draft.records.aiReviews["ai-1"] = {
      id: "ai-1",
      userId: "local-user",
      targetType: "TASK",
      targetId: finishedTaskId,
      provider: "manual",
      strengths: ["Steady pacing"],
      gaps: ["Scope notes"],
      questions: ["What next"],
      generatedAt: at,
      timeZoneAtGeneration: "Europe/Amsterdam",
    };
    // Legacy media row: migrated into media_records for forensic completeness
    // (ADR-0015); no API serves or writes it.
    draft.records.mediaRecords ??= {};
    draft.records.mediaRecords["image-aaa.png"] = {
      id: "image-aaa.png",
      filename: "image-aaa.png",
      userId: "local-user",
      mediaType: "image/png",
      byteLength: 1234,
      createdAt: at,
    };
    draft.records.emailPreferences ??= {};
    draft.records.emailPreferences["local-user"] = {
      id: "local-user",
      userId: "local-user",
      digestUnsubscribedAt: at,
      updatedAt: at,
    };
    return { kind: "changed", value: undefined };
  });

  await builder.transact({ kind: "AUTHENTICATION" }, (draft) => {
    draft.records.accounts ??= {};
    draft.records.accounts["account-1"] = {
      id: "account-1",
      userId: "local-user",
      email: "owner@example.test",
      role: "OWNER",
      passwordVerifier: {
        algorithm: "scrypt",
        version: 1,
        N: 2 ** 14,
        r: 8,
        p: 1,
        maxmem: 1024,
        salt: "c2FsdHNhbHRzYWx0c2FsdA",
        derivedKey: "e".repeat(88),
      },
      createdAt: at,
      updatedAt: at,
    };
    draft.records.authInvites ??= {};
    draft.records.authInvites["a".repeat(64)] = {
      id: "a".repeat(64),
      intendedEmail: "member@example.test",
      role: "MEMBER",
      createdByUserId: "local-user",
      bootstrap: false,
      createdAt: at,
      expiresAt: later,
    };
    draft.records.authSessions ??= {};
    draft.records.authSessions["b".repeat(64)] = {
      id: "b".repeat(64),
      accountId: "account-1",
      userId: "local-user",
      createdAt: at,
      lastSeenAt: at,
      expiresAt: later,
    };
    return { kind: "changed", value: undefined };
  });

  await builder.transact(STANDARD_INTENT, (draft) => {
    draft.commandReceipts["local-user:cmd-1"] = {
      userId: "local-user",
      key: "cmd-1",
      method: "POST",
      route: "/api/journey",
      requestFingerprint: "fp-1",
      result: { outcomeKind: "THOUGHT", createdRecordIds: ["entry-1"], affectedRecordIds: [], outcomeFacts: {} },
      committedStoreRevision: draft.storeRevision + 1,
      createdAt: at,
    };
    return { kind: "changed", value: undefined };
  });

  const source = await builder.read((state) => state);
  builder.close();
  return { source, raw: serializeJourneyState(source) };
}

async function writeJsonSource(directory: string, raw: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "journey-state.json"), raw);
}

describe("selectBootMode", () => {
  it("serves SQLite when the database exists", () => {
    expect(selectBootMode(true, true)).toBe("sqlite");
    expect(selectBootMode(true, false)).toBe("sqlite");
  });

  it("migrates when only JSON exists", () => {
    expect(selectBootMode(false, true)).toBe("migrate");
  });

  it("seeds fresh when neither exists", () => {
    expect(selectBootMode(false, false)).toBe("fresh");
  });
});

describe("JSON → SQLite importer", () => {
  it("imports a valid supersession whose replacement ID sorts before its original", async () => {
    const source = createNoHistorySeed(at);
    source.records.decisionRecords["z-original"] = {
      id: "z-original", userId: "local-user", title: "Original", decisionDate: "2026-09-27", status: "SUPERSEDED",
      context: "Initial context", constraints: [], options: [], decision: "Initial choice", assumptions: [], createdAt: at, updatedAt: at,
    };
    source.records.decisionRecords["a-replacement"] = {
      id: "a-replacement", userId: "local-user", supersedesDecisionId: "z-original", title: "Replacement",
      status: "DRAFT", constraints: [], options: [], assumptions: [], createdAt: at, updatedAt: at,
    };
    source.records.decisionReviews["review-supersede"] = {
      id: "review-supersede", decisionId: "z-original", sequence: 1, reviewedAt: at,
      timeZoneAtReview: "Europe/Amsterdam", outcome: "SUPERSEDE", replacementDecisionId: "a-replacement", createdAt: at,
    };
    const root = await tempRoot();
    const directory = join(root, "store");
    await writeJsonSource(directory, serializeJourneyState(source));
    const summary = await importJsonDirectory({ directory, clock: new FixedClock(instant), idGenerator: new RandomIdGenerator() });
    expect(await summary.store.read((state) => state.records.decisionRecords["a-replacement"]?.supersedesDecisionId)).toBe("z-original");
    summary.store.close();
  });

  it("round-trips a rich state, freezes a timestamped backup, and reports orphans", async () => {
    expect(SEARCH_PARITY_QUERIES.length).toBeGreaterThanOrEqual(5);
    const { source, raw } = await buildRichSource();
    const root = await tempRoot();
    const directory = join(root, "store");
    await writeJsonSource(directory, raw);

    const summary = await importJsonDirectory({
      directory,
      clock: new FixedClock(instant),
      idGenerator: new RandomIdGenerator(),
    });

    // Timestamped backup frozen before the load; source JSON untouched.
    expect(summary.backupPath).toMatch(/journey-state\.pre-sqlite-.*\.json$/);
    expect(await readFile(summary.backupPath, "utf8")).toBe(raw);
    expect(await readFile(join(directory, "journey-state.json"), "utf8")).toBe(raw);

    // Full round-trip: media rows migrated, receipts identical.
    const target = await summary.store.read((state) => state);
    expect(target.storeRevision).toBe(source.storeRevision);
    expect(target.commandReceipts).toEqual(source.commandReceipts);
    expect(equalJson(target, source)).toBe(true);
    expect(summary.counts.receipts).toBe(1);
    expect(summary.counts.perCollection["mediaRecords"]).toBe(1);
    expect(summary.counts.perCollection["emailPreferences"]).toBe(1);
    expect(summary.counts.perCollection["aiReviews"]).toBe(1);
    expect(summary.searchParityQueries).toBeGreaterThanOrEqual(5);
    expect(await summary.store.search("local-user", { query: "earn", limit: 100 })).toEqual(
      searchRecords(source, "local-user", { query: "earn", limit: 100 }),
    );
    summary.store.close();

    // Orphans report names the migrated file + the referencing entry.
    expect(summary.orphansPath).toBe(join(directory, "media-orphans.json"));
    const orphans = JSON.parse(await readFile(summary.orphansPath!, "utf8")) as {
      mediaRecords: Array<{ filename: string }>;
      references: Array<{ entryId: string; filename: string }>;
    };
    expect(orphans.mediaRecords.map((item) => item.filename)).toEqual(["image-aaa.png"]);
    expect(orphans.references).toEqual([{ entryId: "entry-1", kind: "journeyEntry", filename: "image-aaa.png" }]);

    // Reopening serves the migrated state; the importer refuses to run twice.
    const reopened = new SqliteJourneyStore({
      directory,
      clock: new FixedClock(instant),
      idGenerator: new RandomIdGenerator(),
      seed: createProductionSeed,
    });
    await reopened.initialize();
    expect(await reopened.read((state) => state.storeRevision)).toBe(source.storeRevision);
    reopened.close();
    await expect(
      importJsonDirectory({ directory, clock: new FixedClock(instant), idGenerator: new RandomIdGenerator() }),
    ).rejects.toMatchObject({ code: "STORE_WRITE_FAILED" });
  });

  it("reports no orphans path when the source has no media", async () => {
    const root = await tempRoot();
    const directory = join(root, "store");
    await writeJsonSource(directory, serializeJourneyState(createNoHistorySeed(at)));
    const summary = await importJsonDirectory({
      directory,
      clock: new FixedClock(instant),
      idGenerator: new RandomIdGenerator(),
    });
    expect(summary.orphansPath).toBeUndefined();
    expect(await readdir(directory)).not.toContain("media-orphans.json");
    summary.store.close();
  });

  it("fails closed on corrupt JSON with all files preserved", async () => {
    const root = await tempRoot();
    const directory = join(root, "store");
    await writeJsonSource(directory, "not-json\n");
    await expect(
      importJsonDirectory({ directory, clock: new FixedClock(instant), idGenerator: new RandomIdGenerator() }),
    ).rejects.toMatchObject({ code: "STORE_CORRUPT" });
    expect(await readFile(join(directory, "journey-state.json"), "utf8")).toBe("not-json\n");
    expect(await readdir(directory)).not.toContain("waypoint.db");
    expect((await readdir(directory)).some((name) => name.startsWith("journey-state.pre-sqlite-"))).toBe(false);
  });

  it("fails closed on schema-valid but domain-invalid JSON", async () => {
    const root = await tempRoot();
    const directory = join(root, "store");
    await writeJsonSource(directory, '{"schemaVersion":1}\n');
    await expect(
      importJsonDirectory({ directory, clock: new FixedClock(instant), idGenerator: new RandomIdGenerator() }),
    ).rejects.toBeInstanceOf(StoreError);
    expect(await readdir(directory)).not.toContain("waypoint.db");
  });

  it("collects media references from decision text as well as entries", () => {
    const base = createNoHistorySeed(at);
    base.records.journeyEntries["entry-9"] = {
      id: "entry-9",
      userId: "local-user",
      occurredAt: at,
      timeZoneAtOccurrence: "Europe/Amsterdam",
      text: "See /api/media/image-old.gif for context",
      tags: [],
      changedMyMind: false,
      createdAt: at,
    };
    const report = collectMediaOrphans(base, at);
    expect(report?.references).toEqual([{ entryId: "entry-9", kind: "journeyEntry", filename: "image-old.gif" }]);
    expect(collectMediaOrphans(createNoHistorySeed(at), at)).toBeUndefined();
  });
});

describe("bootJourneyStore", () => {
  function deps(directory: string, seed = createProductionSeed) {
    return {
      directory,
      clock: new FixedClock(instant),
      idGenerator: new SequenceIdGenerator(["boot-marker", "boot-extra", "import-marker", "import-extra"]),
      seed,
    };
  }

  it("lets the auth bootstrap command import a JSON-only store", async () => {
    const root = await tempRoot();
    const directory = join(root, "store");
    await writeJsonSource(directory, serializeJourneyState(createNoHistorySeed(at)));
    const result = await execFileAsync(process.execPath, ["--import", "tsx", "server/bootstrap-auth.ts", "--email", "owner@example.com"], {
      cwd: process.cwd(),
      env: { ...process.env, JOURNEY_STORE_DIR: directory, JOURNEY_FIXED_NOW: at },
    });
    expect(result.stdout).toContain("Bootstrap invite for owner@example.com");
    expect(await readdir(directory)).toContain("waypoint.db");
    const opened = await bootJourneyStore(deps(directory));
    expect(await opened.store.read((state) => Object.keys(state.records.authInvites ?? {}).length)).toBe(1);
    opened.store.close();
  });

  it("opens an existing SQLite database and ignores leftover JSON", async () => {
    const root = await tempRoot();
    const directory = join(root, "store");
    const first = new SqliteJourneyStore({ ...deps(directory), seed: createNoHistorySeed });
    await first.initialize();
    await first.transact(STANDARD_INTENT, (draft) => {
      draft.commandReceipts["local-user:k"] = {
        userId: "local-user",
        key: "k",
        method: "POST",
        route: "/api/test",
        requestFingerprint: "f",
        result: { outcomeKind: "TEST", createdRecordIds: [], affectedRecordIds: [], outcomeFacts: {} },
        committedStoreRevision: 1,
        createdAt: at,
      };
      return { kind: "changed", value: undefined };
    });
    first.close();
    await writeFile(join(directory, "journey-state.json"), '{"stale":true}\n');

    const boot = await bootJourneyStore(deps(directory, createNoHistorySeed));
    expect(boot.mode).toBe("sqlite");
    expect(boot.backupPath).toBeUndefined();
    expect(await boot.store.read((state) => state.storeRevision)).toBe(1);
    boot.store.close();
  });

  it("migrates from JSON and creates no media directory", async () => {
    const { raw } = await buildRichSource();
    const root = await tempRoot();
    const directory = join(root, "store");
    await writeJsonSource(directory, raw);

    const boot = await bootJourneyStore(deps(directory));
    expect(boot.mode).toBe("migrate");
    expect(boot.backupPath).toMatch(/pre-sqlite/);
    expect(boot.orphansPath).toContain("media-orphans.json");
    expect(await boot.store.read((state) => state.storeRevision)).toBe(3);
    boot.store.close();
    expect(await readdir(directory)).not.toContain("media");
  });

  it("preserves a truncated database and stale JSON for explicit recovery", async () => {
    const { raw } = await buildRichSource();
    const root = await tempRoot();
    const directory = join(root, "store");
    await writeJsonSource(directory, raw);
    // A JSON-era directory always carries the authority marker; without it
    // the boot fails closed before even reaching database verification.
    await writeFile(join(directory, ".journey-store"), JSON.stringify({ storeId: "json-era", createdAt: at }));
    await writeFile(join(directory, "waypoint.db"), "truncated-partial-bytes");

    await expect(bootJourneyStore(deps(directory))).rejects.toMatchObject({ code: "STORE_CORRUPT" });
    expect(await readFile(join(directory, "waypoint.db"), "utf8")).toBe("truncated-partial-bytes");
    expect(await readFile(join(directory, "journey-state.json"), "utf8")).toBe(raw);
  });

  it("does not replace a newer SQLite store when its schema is unsupported", async () => {
    const root = await tempRoot();
    const directory = join(root, "store");
    const store = new SqliteJourneyStore({ ...deps(directory), seed: createNoHistorySeed });
    await store.initialize();
    await store.transact(STANDARD_INTENT, (draft) => {
      draft.records.journeyEntries["new-thought"] = { id: "new-thought", userId: "local-user", occurredAt: at, timeZoneAtOccurrence: "Europe/Amsterdam", text: "New authoritative thought", tags: [], changedMyMind: false, createdAt: at };
      return { kind: "changed", value: undefined };
    });
    store.close();
    await writeJsonSource(directory, serializeJourneyState(createNoHistorySeed(at)));
    const db = new DatabaseSync(join(directory, "waypoint.db"));
    db.exec("PRAGMA journal_mode=DELETE");
    db.prepare("UPDATE meta SET value = '2' WHERE key = 'schema_version'").run();
    db.close();
    await expect(bootJourneyStore(deps(directory))).rejects.toMatchObject({ code: "STORE_SCHEMA_UNSUPPORTED" });
    const reader = new DatabaseSync(join(directory, "waypoint.db"), { readOnly: true });
    expect(reader.prepare("SELECT id FROM journey_entries WHERE id = 'new-thought'").get()).toBeDefined();
    reader.close();
  });

  it("fails closed on a truncated database with no JSON to recover from", async () => {
    const root = await tempRoot();
    const directory = join(root, "store");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, ".journey-store"), JSON.stringify({ storeId: "orphan", createdAt: at }));
    await writeFile(join(directory, "waypoint.db"), "truncated-partial-bytes");
    await expect(bootJourneyStore(deps(directory))).rejects.toMatchObject({ code: "STORE_CORRUPT" });
  });

  it("seeds fresh when the directory does not exist", async () => {
    const root = await tempRoot();
    const directory = join(root, "store");
    const boot = await bootJourneyStore(deps(directory, createNoHistorySeed));
    expect(boot.mode).toBe("fresh");
    expect(await boot.store.read((state) => state.records.users["local-user"]?.name)).toBe("Ali");
    boot.store.close();
  });
});
