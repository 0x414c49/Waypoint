// @vitest-environment node
// Store contract tests against the SQLite store (ADR-0014). The JSON adapter
// was deleted in Phase 2; the former parameterized JSON/SQLite parity harness
// now runs SQLite only.
import { mkdtemp, rm, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { createNoHistorySeed, type JourneyState } from "../../domain/journey-state.js";
import { createProductionSeed } from "../../domain/production-seed.js";
import { FixedClock } from "../../ports/clock.js";
import { SequenceIdGenerator } from "../../ports/id-generator.js";
import {
  STANDARD_INTENT,
  type Mutation,
  type TransactionResult,
} from "../../ports/journey-store.js";
import { AppError } from "../../application/app-error.js";
import { SqliteJourneyStore } from "./index.js";

const roots: string[] = [];
const instant = new Date("2026-09-27T10:00:00.000Z");

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "sqlite-store-test-"));
  roots.push(root);
  return root;
}

interface StoreHandle {
  readonly store: SqliteJourneyStore;
  readonly directory: string;
  readonly primaryFile: string;
}

function buildStore(
  directory: string,
  options: {
    seed?: (writtenAt: string) => JourneyState;
    ids?: readonly string[];
    mutexTimeoutMs?: number;
    sqliteFailpoint?: (point: "before-commit" | "after-commit") => void;
  } = {},
): StoreHandle {
  const common = {
    directory,
    clock: new FixedClock(instant),
    idGenerator: new SequenceIdGenerator(
      options.ids ?? ["init-directory", "store-id", "commit-1", "commit-2", "commit-3", "commit-4", "commit-5"],
    ),
    seed: options.seed ?? createNoHistorySeed,
    ...(options.mutexTimeoutMs === undefined ? {} : { mutexTimeoutMs: options.mutexTimeoutMs }),
  };
  return {
    store: new SqliteJourneyStore(
      options.sqliteFailpoint ? { ...common, failpoint: options.sqliteFailpoint } : common,
    ),
    directory,
    primaryFile: "waypoint.db",
  };
}

function receipt(key: string, fingerprint: string, revision: number) {
  return {
    userId: "local-user",
    key,
    method: "POST",
    route: "/api/test",
    requestFingerprint: fingerprint,
    result: {
      outcomeKind: "TEST",
      createdRecordIds: [] as string[],
      affectedRecordIds: [] as string[],
      outcomeFacts: {},
    },
    committedStoreRevision: revision,
    createdAt: instant.toISOString(),
  };
}

async function corruptPrimary(handle: StoreHandle, mode: "schema" | "garbage"): Promise<void> {
  const primary = join(handle.directory, handle.primaryFile);
  if (mode === "garbage") {
    await writeFile(primary, "not-a-database\n");
    return;
  }
  const db = new DatabaseSync(primary);
  db.exec("PRAGMA journal_mode=DELETE; PRAGMA foreign_keys=OFF;");
  db.prepare("UPDATE meta SET value = '2' WHERE key = 'schema_version'").run();
  db.close();
}

describe("store contract on sqlite", () => {
  it("atomically creates a private, validated store", async () => {
    const root = await tempRoot();
    const handle = buildStore(join(root, "store"));
    const diagnostics = (await handle.store.initialize()) as { initialized: boolean; storeId: string };

    const state = await handle.store.read((snapshot) => snapshot);
    expect(diagnostics).toMatchObject({ initialized: true, storeId: "store-id" });
    expect(state.storeRevision).toBe(0);
    expect(state.records.users["local-user"]?.name).toBe("Ali");
    const dirMode = (await stat(handle.directory)).mode & 0o777;
    const primaryMode = (await stat(join(handle.directory, handle.primaryFile))).mode & 0o777;
    expect(dirMode).toBe(0o700);
    expect(primaryMode).toBe(0o600);
    expect((await readFile(join(handle.directory, handle.primaryFile))).length).toBeGreaterThan(0);
    handle.store.close?.();
  });

  it("fails closed when an interrupted initialization sibling exists", async () => {
    const root = await tempRoot();
    await mkdir(join(root, ".store.init-abandoned"));
    await expect(buildStore(join(root, "store")).store.initialize()).rejects.toMatchObject({
      code: "RECOVERY_REQUIRED",
    });
  });

  it("does not adopt an unmarked directory", async () => {
    const root = await tempRoot();
    const directory = join(root, "store");
    await mkdir(directory);
    await writeFile(join(directory, "sentinel.txt"), "foreign\n");
    await expect(buildStore(directory).store.initialize()).rejects.toMatchObject({
      code: "RECOVERY_REQUIRED",
    });
  });

  it("requires an intact authority marker", async () => {
    const root = await tempRoot();
    const handle = buildStore(join(root, "store"));
    await handle.store.initialize();
    handle.store.close?.();
    await writeFile(join(handle.directory, ".journey-store"), "not-json\n");
    await expect(buildStore(handle.directory).store.initialize()).rejects.toMatchObject({
      code: "RECOVERY_REQUIRED",
    });
  });

  it("distinguishes unsupported schemas from corrupt documents", async () => {
    const root = await tempRoot();
    const directory = join(root, "store");
    const handle = buildStore(directory);
    await handle.store.initialize();
    handle.store.close?.();

    const reopen = (): StoreHandle => buildStore(directory);
    await corruptPrimary(handle, "schema");
    await expect(reopen().store.initialize()).rejects.toMatchObject({ code: "STORE_SCHEMA_UNSUPPORTED" });
    await corruptPrimary(handle, "garbage");
    await expect(reopen().store.initialize()).rejects.toMatchObject({ code: "STORE_CORRUPT" });
  });

  it("commits once and advances the revision", async () => {
    const root = await tempRoot();
    const handle = buildStore(join(root, "store"));
    await handle.store.initialize();

    const result = await handle.store.transact(STANDARD_INTENT, (draft) => {
      draft.commandReceipts["local-user:command-1"] = receipt("command-1", "fingerprint", 1);
      return { kind: "changed", value: "added" };
    });
    expect(result.changed).toBe(true);
    expect(result.value).toBe("added");
    expect(result.state.storeRevision).toBe(1);
    expect(result.state.commandReceipts["local-user:command-1"]?.requestFingerprint).toBe("fingerprint");

    const reopened = buildStore(handle.directory);
    await reopened.store.initialize();
    expect(await reopened.store.read((state) => state.storeRevision)).toBe(1);
    expect(
      await reopened.store.read(
        (state) => state.commandReceipts["local-user:command-1"]?.requestFingerprint,
      ),
    ).toBe("fingerprint");
    handle.store.close?.();
    reopened.store.close?.();
  });

  it("does not advance the revision for a true no-op", async () => {
    const root = await tempRoot();
    const handle = buildStore(join(root, "store"));
    await handle.store.initialize();
    const result = await handle.store.transact(STANDARD_INTENT, () => ({ kind: "no-change", value: "same" }));
    expect(result.changed).toBe(false);
    expect(result.value).toBe("same");
    expect(result.state.storeRevision).toBe(0);
    handle.store.close?.();
  });

  it("returns isolated snapshots and frozen commit results", async () => {
    const root = await tempRoot();
    const handle = buildStore(join(root, "store"));
    await handle.store.initialize();

    // Read projections are detached clones: mutating one never leaks back.
    const users = await handle.store.read((snapshot) => snapshot.records.users);
    (users as Record<string, unknown>)["intruder"] = { id: "intruder" };
    expect(await handle.store.read((snapshot) => snapshot.records.users["intruder"])).toBeUndefined();

    // Commit results are deeply frozen and cannot retain a mutable draft.
    const committed = await handle.store.transact(STANDARD_INTENT, (draft) => {
      draft.commandReceipts["local-user:k"] = receipt("k", "f", 1);
      return { kind: "changed", value: 1 };
    });
    expect(Object.isFrozen(committed)).toBe(true);
    expect(Object.isFrozen(committed.state)).toBe(true);
    expect(() => {
      (committed.state as { storeRevision: number }).storeRevision = 99;
    }).toThrow();
    expect(await handle.store.read((state) => state.storeRevision)).toBe(1);
    handle.store.close?.();
  });

  it("replays the same fingerprint and conflicts on a different one", async () => {
    const root = await tempRoot();
    const handle = buildStore(join(root, "store"));
    await handle.store.initialize();

    const runCommand = (key: string, fingerprint: string): Promise<TransactionResult<string>> =>
      handle.store.transact(STANDARD_INTENT, (draft): Mutation<string> => {
        const existing = draft.commandReceipts[`local-user:${key}`];
        if (existing) {
          if (existing.requestFingerprint !== fingerprint) {
            throw new AppError(
              409,
              "IDEMPOTENCY_KEY_REUSED",
              "That action key was already used",
              "Use a new action key for a different request.",
            );
          }
          return { kind: "no-change", value: existing.result.outcomeKind };
        }
        draft.commandReceipts[`local-user:${key}`] = {
          ...receipt(key, fingerprint, draft.storeRevision + 1),
          result: {
            outcomeKind: "FIRST",
            createdRecordIds: [],
            affectedRecordIds: [],
            outcomeFacts: {},
          },
        };
        return { kind: "changed", value: "FIRST" };
      });

    const first = await runCommand("action-key", "fp-one");
    expect(first.changed).toBe(true);
    const replay = await runCommand("action-key", "fp-one");
    expect(replay.changed).toBe(false);
    expect(replay.value).toBe("FIRST");
    expect(replay.state.storeRevision).toBe(1);
    await expect(runCommand("action-key", "fp-two")).rejects.toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSED",
    });
    expect(await handle.store.read((state) => state.storeRevision)).toBe(1);
    handle.store.close?.();
  });

  it("serializes concurrent writers without losing commits", async () => {
    const root = await tempRoot();
    const handle = buildStore(join(root, "store"));
    await handle.store.initialize();

    const results = await Promise.all(
      ["a", "b", "c"].map((key, index) =>
        handle.store.transact(STANDARD_INTENT, (draft) => {
          draft.commandReceipts[`local-user:${key}`] = receipt(key, "f", draft.storeRevision + 1);
          return { kind: "changed", value: index };
        }),
      ),
    );
    expect(results.every((result) => result.changed)).toBe(true);
    expect(await handle.store.read((state) => state.storeRevision)).toBe(3);
    handle.store.close?.();
  });

  it("rejects transition violations through every intent kind", async () => {
    const root = await tempRoot();
    const handle = buildStore(join(root, "store"), { seed: createProductionSeed });
    await handle.store.initialize();
    const taskId = "2026-11-03-partial-failure";

    // STANDARD cannot change plan-owned fields on an existing task.
    await expect(
      handle.store.transact(STANDARD_INTENT, (draft) => {
        draft.records.tasks[taskId]!.title = "Rewritten plan";
        return { kind: "changed", value: 0 };
      }),
    ).rejects.toMatchObject({ code: "STORE_WRITE_FAILED" });

    // PLAN_APPLY cannot create execution-owned records (candidate-valid, unauthorized).
    await expect(
      handle.store.transact({ kind: "PLAN_APPLY" }, (draft) => {
        draft.records.journeyEntries["entry-1"] = {
          id: "entry-1",
          userId: "local-user",
          occurredAt: instant.toISOString(),
          timeZoneAtOccurrence: "Europe/Amsterdam",
          text: "A plan-side note",
          tags: [],
          changedMyMind: false,
          createdAt: instant.toISOString(),
        };
        return { kind: "changed", value: 0 };
      }),
    ).rejects.toMatchObject({ code: "STORE_WRITE_FAILED" });

    // JOURNEY_DELETE must remove exactly the named entry (and it exists here only in draft).
    await expect(
      handle.store.transact({ kind: "JOURNEY_DELETE", journeyEntryId: "no-such-entry" }, (draft) => {
        draft.commandReceipts["local-user:x"] = receipt("x", "f", 1);
        return { kind: "changed", value: 0 };
      }),
    ).rejects.toMatchObject({ code: "STORE_WRITE_FAILED" });

    // AUTHENTICATION cannot change learning records, but can touch auth collections.
    await expect(
      handle.store.transact({ kind: "AUTHENTICATION" }, (draft) => {
        draft.records.tasks[taskId]!.title = "Auth-side rewrite";
        return { kind: "changed", value: 0 };
      }),
    ).rejects.toMatchObject({ code: "STORE_WRITE_FAILED" });
    const authTouch = await handle.store.transact({ kind: "AUTHENTICATION" }, (draft) => {
      draft.records.users["local-user"]!.name = "Renamed";
      return { kind: "changed", value: 0 };
    });
    expect(authTouch.changed).toBe(true);
    expect(await handle.store.read((state) => state.storeRevision)).toBe(1);
    handle.store.close?.();
  });
});

describe("SqliteJourneyStore durability and verification", () => {
  it("round-trips the production seed byte-for-byte through the domain", async () => {
    const root = await tempRoot();
    const directory = join(root, "store");
    const handle = buildStore(directory, { seed: createProductionSeed });
    await handle.store.initialize();
    const expected = createProductionSeed(instant.toISOString());
    await expect(handle.store.read((state) => state)).resolves.toEqual(expected);
    handle.store.close?.();
  });

  it("leaves the prior state authoritative when a write fails before commit", async () => {
    const root = await tempRoot();
    const directory = join(root, "store");
    const handle = buildStore(directory, {
      sqliteFailpoint: (point) => {
        if (point === "before-commit") throw new Error("simulated");
      },
    });
    await handle.store.initialize();
    await expect(
      handle.store.transact(STANDARD_INTENT, (draft) => {
        draft.commandReceipts["local-user:command-1"] = receipt("command-1", "fingerprint", 1);
        return { kind: "changed", value: 0 };
      }),
    ).rejects.toMatchObject({ code: "STORE_WRITE_FAILED" });
    handle.store.close?.();

    const reopened = buildStore(directory);
    await reopened.store.initialize();
    expect(await reopened.store.read((state) => state.storeRevision)).toBe(0);
    expect(await reopened.store.read((state) => state.commandReceipts)).toEqual({});
    reopened.store.close?.();
  });

  it("reports uncertainty after commit while keeping the committed state", async () => {
    const root = await tempRoot();
    const directory = join(root, "store");
    const handle = buildStore(directory, {
      sqliteFailpoint: (point) => {
        if (point === "after-commit") throw new Error("simulated");
      },
    });
    await handle.store.initialize();
    await expect(
      handle.store.transact(STANDARD_INTENT, (draft) => {
        draft.commandReceipts["local-user:command-1"] = receipt("command-1", "fingerprint", 1);
        return { kind: "changed", value: 0 };
      }),
    ).rejects.toMatchObject({ code: "STORE_DURABILITY_UNCERTAIN" });
    handle.store.close?.();

    const reopened = buildStore(directory);
    await reopened.store.initialize();
    expect(await reopened.store.read((state) => state.storeRevision)).toBe(1);
    expect(
      await reopened.store.read(
        (state) => state.commandReceipts["local-user:command-1"]?.requestFingerprint,
      ),
    ).toBe("fingerprint");
    reopened.store.close?.();
  });

  it("rejects a second active session for the same user", async () => {
    const root = await tempRoot();
    const directory = join(root, "store");
    const seed = (writtenAt: string): JourneyState => {
      const base = createNoHistorySeed(writtenAt);
      base.records.quarters["q1"] = {
        id: "q1",
        userId: "local-user",
        title: "Q",
        startDate: "2026-09-01",
        endDate: "2026-12-31",
        successCriteria: [],
        planRevision: 1,
        intentSnapshot: {
          capturedAt: writtenAt,
          planRevision: 1,
          timeZoneAtCapture: "Europe/Amsterdam",
          title: "Q",
          startDate: "2026-09-01",
          endDate: "2026-12-31",
          successCriteria: [],
          focusAreas: [],
        },
        createdAt: writtenAt,
        updatedAt: writtenAt,
      };
      base.records.tasks["task-1"] = {
        id: "task-1",
        quarterId: "q1",
        plannedDate: "2026-09-27",
        title: "T",
        tags: [],
        position: 0,
        recommendationMode: "DEFAULT",
        status: "NOT_STARTED",
        planSnapshot: {
          capturedAt: writtenAt,
          planRevision: 1,
          plannedDate: "2026-09-27",
          title: "T",
          tags: [],
          recommendationMode: "DEFAULT",
        },
        createdAt: writtenAt,
        updatedAt: writtenAt,
      };
      return base;
    };
    const handle = buildStore(directory, { seed });
    await handle.store.initialize();

    await handle.store.transact(STANDARD_INTENT, (draft) => {
      draft.records.tasks["task-1"]!.status = "IN_PROGRESS";
      draft.records.sessions["session-1"] = {
        id: "session-1",
        taskId: "task-1",
        startedAt: instant.toISOString(),
        timeZoneAtStart: "Europe/Amsterdam",
        createdAt: instant.toISOString(),
        updatedAt: instant.toISOString(),
      };
      return { kind: "changed", value: 0 };
    });
    await expect(
      handle.store.transact(STANDARD_INTENT, (draft) => {
        draft.records.sessions["session-2"] = {
          id: "session-2",
          taskId: "task-1",
          startedAt: "2026-09-27T11:00:00.000Z",
          timeZoneAtStart: "Europe/Amsterdam",
          createdAt: "2026-09-27T11:00:00.000Z",
          updatedAt: "2026-09-27T11:00:00.000Z",
        };
        return { kind: "changed", value: 0 };
      }),
    ).rejects.toThrow();
    expect(await handle.store.read((state) => Object.keys(state.records.sessions))).toEqual(["session-1"]);
    handle.store.close?.();
  });

  it("closes and corrects a session interval without touching the insert-only owner", async () => {
    const root = await tempRoot();
    const directory = join(root, "store");
    const seed = (writtenAt: string): JourneyState => {
      const base = createNoHistorySeed(writtenAt);
      base.records.quarters["q1"] = {
        id: "q1",
        userId: "local-user",
        title: "Q",
        startDate: "2026-09-01",
        endDate: "2026-12-31",
        successCriteria: [],
        planRevision: 1,
        intentSnapshot: {
          capturedAt: writtenAt,
          planRevision: 1,
          timeZoneAtCapture: "Europe/Amsterdam",
          title: "Q",
          startDate: "2026-09-01",
          endDate: "2026-12-31",
          successCriteria: [],
          focusAreas: [],
        },
        createdAt: writtenAt,
        updatedAt: writtenAt,
      };
      base.records.tasks["task-1"] = {
        id: "task-1",
        quarterId: "q1",
        plannedDate: "2026-09-27",
        title: "T",
        tags: [],
        position: 0,
        recommendationMode: "DEFAULT",
        status: "NOT_STARTED",
        planSnapshot: {
          capturedAt: writtenAt,
          planRevision: 1,
          plannedDate: "2026-09-27",
          title: "T",
          tags: [],
          recommendationMode: "DEFAULT",
        },
        createdAt: writtenAt,
        updatedAt: writtenAt,
      };
      return base;
    };
    const handle = buildStore(directory, { seed });
    await handle.store.initialize();

    await handle.store.transact(STANDARD_INTENT, (draft) => {
      draft.records.tasks["task-1"]!.status = "IN_PROGRESS";
      draft.records.sessions["session-1"] = {
        id: "session-1",
        taskId: "task-1",
        startedAt: instant.toISOString(),
        timeZoneAtStart: "Europe/Amsterdam",
        createdAt: instant.toISOString(),
        updatedAt: instant.toISOString(),
      };
      return { kind: "changed", value: 0 };
    });
    await handle.store.transact(STANDARD_INTENT, (draft) => {
      draft.records.tasks["task-1"]!.status = "PAUSED";
      draft.records.sessions["session-1"]!.endedAt = "2026-09-27T10:30:00.000Z";
      draft.records.sessions["session-1"]!.updatedAt = "2026-09-27T10:30:00.000Z";
      return { kind: "changed", value: 0 };
    });
    await handle.store.transact(STANDARD_INTENT, (draft) => {
      const session = draft.records.sessions["session-1"]!;
      session.startedAt = "2026-09-27T10:05:00.000Z";
      session.endedAt = "2026-09-27T10:35:00.000Z";
      session.updatedAt = "2026-09-27T10:35:00.000Z";
      session.correctedAt = "2026-09-27T10:35:00.000Z";
      return { kind: "changed", value: 0 };
    });

    const session = await handle.store.read((state) => state.records.sessions["session-1"]);
    expect(session?.correctedAt).toBe("2026-09-27T10:35:00.000Z");
    expect(await handle.store.read((state) => state.storeRevision)).toBe(3);
    const raw = new DatabaseSync(join(directory, "waypoint.db"), { readOnly: true });
    try {
      expect(
        (raw.prepare("SELECT owner_user_id FROM sessions WHERE id = 'session-1'").get() as { owner_user_id: string })
          .owner_user_id,
      ).toBe("local-user");
    } finally {
      raw.close();
    }
    handle.store.close?.();
  });

  it("fails closed when a bad row reaches the database", async () => {
    const root = await tempRoot();
    const directory = join(root, "store");
    const handle = buildStore(directory);
    await handle.store.initialize();
    handle.store.close?.();

    const raw = new DatabaseSync(join(directory, "waypoint.db"));
    raw.exec("PRAGMA journal_mode=DELETE; PRAGMA foreign_keys=OFF;");
    raw
      .prepare(
        "INSERT INTO email_preferences (id, user_id, digest_unsubscribed_at, updated_at) VALUES ('ghost', 'ghost-user', NULL, '2026-09-27T10:00:00.000Z')",
      )
      .run();
    raw.close();

    await expect(buildStore(directory).store.initialize()).rejects.toMatchObject({
      code: "STORE_CORRUPT",
    });
  });

  it("fails closed when header metadata is not a valid instant", async () => {
    const root = await tempRoot();
    const directory = join(root, "store");
    const handle = buildStore(directory);
    await handle.store.initialize();
    handle.store.close?.();

    const raw = new DatabaseSync(join(directory, "waypoint.db"));
    raw.exec("PRAGMA journal_mode=DELETE; PRAGMA foreign_keys=OFF;");
    raw.prepare("UPDATE meta SET value = 'not-an-instant' WHERE key = 'written_at'").run();
    raw.close();

    await expect(buildStore(directory).store.initialize()).rejects.toMatchObject({
      code: "STORE_CORRUPT",
    });
  });

  it("keeps private permissions and WAL files alongside the primary", async () => {
    const root = await tempRoot();
    const directory = join(root, "store");
    const handle = buildStore(directory);
    await handle.store.initialize();

    expect(((await stat(directory)).mode & 0o777)).toBe(0o700);
    expect(((await stat(join(directory, "waypoint.db"))).mode & 0o777)).toBe(0o600);
    expect(((await stat(join(directory, ".journey-store"))).mode & 0o777)).toBe(0o600);

    await handle.store.transact(STANDARD_INTENT, (draft) => {
      draft.commandReceipts["local-user:k"] = receipt("k", "f", 1);
      return { kind: "changed", value: 0 };
    });

    const raw = new DatabaseSync(join(directory, "waypoint.db"), { readOnly: true });
    expect((raw.prepare("PRAGMA journal_mode").get() as { journal_mode: string }).journal_mode).toBe("wal");
    raw.close();

    const names = await readdir(directory);
    expect(names).toContain("waypoint.db-wal");
    expect(names).toContain("waypoint.db-shm");
    handle.store.close?.();
  });

  it(
    "maps a locked database to retryable STORE_BUSY",
    { timeout: 20_000 },
    async () => {
      const root = await tempRoot();
      const directory = join(root, "store");
      const handle = buildStore(directory);
      await handle.store.initialize();

      // A second connection holding BEGIN IMMEDIATE keeps the RESERVED lock for
      // the store's full 5s busy_timeout, so this test takes ~5s by design.
      const locker = new DatabaseSync(join(directory, "waypoint.db"));
      locker.exec("BEGIN IMMEDIATE");
      try {
        await expect(
          handle.store.transact(STANDARD_INTENT, () => ({ kind: "no-change", value: 0 })),
        ).rejects.toMatchObject({ code: "STORE_BUSY" });
      } finally {
        locker.exec("ROLLBACK");
        locker.close();
      }
      expect(await handle.store.read((state) => state.storeRevision)).toBe(0);
      handle.store.close?.();
    },
  );
});
