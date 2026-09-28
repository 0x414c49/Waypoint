// @vitest-environment node
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { createNoHistorySeed, type JourneyState } from "../domain/journey-state.js";
import { createProductionSeed } from "../domain/production-seed.js";
import { FixedClock } from "../ports/clock.js";
import { SequenceIdGenerator } from "../ports/id-generator.js";
import { STANDARD_INTENT } from "../ports/journey-store.js";
import {
  assertJourneyStateTransition,
  JsonJourneyStore,
  StoreError,
  serializeJourneyState,
} from "./json-store/index.js";

const roots: string[] = [];
const instant = new Date("2026-09-27T10:00:00.000Z");

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "journey-store-test-"));
  roots.push(root);
  return root;
}

function buildStore(
  directory: string,
  options: {
    seed?: (writtenAt: string) => JourneyState;
    failpoint?: (point: "before-primary-rename" | "after-primary-rename") => void;
    ids?: readonly string[];
  } = {},
) {
  return new JsonJourneyStore({
    directory,
    clock: new FixedClock(instant),
    idGenerator: new SequenceIdGenerator(
      options.ids ?? ["init-directory", "store-id", "commit-one", "commit-two"],
    ),
    seed: options.seed ?? createNoHistorySeed,
    ...(options.failpoint ? { failpoint: options.failpoint } : {}),
  });
}

async function expectStoreCode(action: Promise<unknown>, code: string): Promise<void> {
  await expect(action).rejects.toMatchObject({ code });
}

describe("JsonJourneyStore initialization", () => {
  it("atomically creates a private, validated no-history store", async () => {
    const root = await tempRoot();
    const directory = join(root, "store");
    const store = buildStore(directory);

    const diagnostics = await store.initialize();
    const state = await store.read((snapshot) => snapshot);

    expect(diagnostics).toMatchObject({ initialized: true, storeId: "store-id" });
    expect(state.storeRevision).toBe(0);
    expect(state.records.users["local-user"]?.name).toBe("Ali");
    expect(
      Object.entries(state.records)
        .filter(([name]) => name !== "users")
        .every(([, records]) => Object.keys(records).length === 0),
    ).toBe(true);
    expect((await stat(directory)).mode & 0o777).toBe(0o700);
    expect((await stat(join(directory, "journey-state.json"))).mode & 0o777).toBe(0o600);
    expect((await readFile(join(directory, "journey-state.json"), "utf8")).endsWith("\n")).toBe(true);
  });

  it("fails closed when an interrupted initialization sibling exists", async () => {
    const root = await tempRoot();
    await mkdir(join(root, ".store.init-abandoned"));
    await expectStoreCode(buildStore(join(root, "store")).initialize(), "RECOVERY_REQUIRED");
  });

  it("does not adopt an unmarked directory", async () => {
    const root = await tempRoot();
    const directory = join(root, "store");
    await mkdir(directory);
    await writeFile(join(directory, "journey-state.json"), "{}\n");
    await expectStoreCode(buildStore(directory).initialize(), "RECOVERY_REQUIRED");
  });

  it("requires an intact authority marker", async () => {
    const root = await tempRoot();
    const directory = join(root, "store");
    const store = buildStore(directory);
    await store.initialize();
    await writeFile(join(directory, ".journey-store"), "not-json\n");
    await expectStoreCode(buildStore(directory).initialize(), "RECOVERY_REQUIRED");
  });

  it("distinguishes unsupported schemas from corrupt documents", async () => {
    const root = await tempRoot();
    const directory = join(root, "store");
    const store = buildStore(directory);
    await store.initialize();
    await writeFile(join(directory, "journey-state.json"), '{"schemaVersion":2}\n');
    await expectStoreCode(buildStore(directory).initialize(), "STORE_SCHEMA_UNSUPPORTED");
    await writeFile(join(directory, "journey-state.json"), "not-json\n");
    await expectStoreCode(buildStore(directory).initialize(), "STORE_CORRUPT");
  });

  it("rejects arbitrary domain records until their real schemas are introduced", async () => {
    const root = await tempRoot();
    const seed = createNoHistorySeed(instant.toISOString());
    (seed.records.sessions as Record<string, { id: string } & Record<string, unknown>>)[
      "made-up"
    ] = { id: "made-up", secretShape: true };
    const store = buildStore(join(root, "store"), { seed: () => seed });
    await expectStoreCode(store.initialize(), "STORE_CORRUPT");
  });

  it("reports a validated backup but never silently restores a corrupt primary", async () => {
    const root = await tempRoot();
    const directory = join(root, "store");
    const store = buildStore(directory);
    await store.initialize();
    await store.transact(STANDARD_INTENT, (draft) => {
      draft.commandReceipts["local-user:command-1"] = {
        userId: "local-user",
        key: "command-1",
        method: "POST",
        route: "/api/test",
        requestFingerprint: "fingerprint",
        result: {
          outcomeKind: "TEST",
          createdRecordIds: [],
          affectedRecordIds: [],
          outcomeFacts: {},
        },
        committedStoreRevision: 1,
        createdAt: instant.toISOString(),
      };
      return { kind: "changed", value: undefined };
    });
    await writeFile(join(directory, "journey-state.json"), "corrupt\n");

    await expect(buildStore(directory).initialize()).rejects.toMatchObject({
      code: "STORE_CORRUPT",
      message: expect.stringContaining("validated backup is available"),
    });
    expect(await readFile(join(directory, "journey-state.json"), "utf8")).toBe("corrupt\n");
  });
});

describe("JsonJourneyStore commits", () => {
  it("commits once, advances the revision, and preserves the prior valid backup", async () => {
    const root = await tempRoot();
    const directory = join(root, "store");
    const store = buildStore(directory);
    await store.initialize();

    const result = await store.transact(STANDARD_INTENT, (draft) => {
      draft.commandReceipts["local-user:command-1"] = {
        userId: "local-user",
        key: "command-1",
        method: "POST",
        route: "/api/test",
        requestFingerprint: "fingerprint",
        result: {
          outcomeKind: "TEST",
          createdRecordIds: [],
          affectedRecordIds: [],
          outcomeFacts: {},
        },
        committedStoreRevision: 1,
        createdAt: instant.toISOString(),
      };
      return { kind: "changed", value: "added" };
    });

    expect(result.changed).toBe(true);
    expect(result.state.storeRevision).toBe(1);
    const backup = JSON.parse(
      await readFile(join(directory, "journey-state.backup.json"), "utf8"),
    ) as JourneyState;
    expect(backup.storeRevision).toBe(0);
    expect(backup.commandReceipts["local-user:command-1"]).toBeUndefined();
  });

  it("preserves the primary when a write fails before replacement", async () => {
    const root = await tempRoot();
    const directory = join(root, "store");
    const store = buildStore(directory, {
      failpoint(point) {
        if (point === "before-primary-rename") throw new Error("simulated");
      },
    });
    await store.initialize();
    const before = await readFile(join(directory, "journey-state.json"), "utf8");
    await expectStoreCode(
      store.transact(STANDARD_INTENT, (draft) => {
        draft.commandReceipts["local-user:command-1"] = {
          userId: "local-user",
          key: "command-1",
          method: "POST",
          route: "/api/test",
          requestFingerprint: "fingerprint",
          result: {
            outcomeKind: "TEST",
            createdRecordIds: [],
            affectedRecordIds: [],
            outcomeFacts: {},
          },
          committedStoreRevision: 1,
          createdAt: instant.toISOString(),
        };
        return { kind: "changed", value: undefined };
      }),
      "STORE_WRITE_FAILED",
    );
    expect(await readFile(join(directory, "journey-state.json"), "utf8")).toBe(before);
  });

  it("reports uncertainty after replacement while leaving a valid committed state", async () => {
    const root = await tempRoot();
    const directory = join(root, "store");
    const store = buildStore(directory, {
      failpoint(point) {
        if (point === "after-primary-rename") throw new Error("simulated");
      },
    });
    await store.initialize();
    await expectStoreCode(
      store.transact(STANDARD_INTENT, (draft) => {
        draft.commandReceipts["local-user:command-1"] = {
          userId: "local-user",
          key: "command-1",
          method: "POST",
          route: "/api/test",
          requestFingerprint: "fingerprint",
          result: {
            outcomeKind: "TEST",
            createdRecordIds: [],
            affectedRecordIds: [],
            outcomeFacts: {},
          },
          committedStoreRevision: 1,
          createdAt: instant.toISOString(),
        };
        return { kind: "changed", value: undefined };
      }),
      "STORE_DURABILITY_UNCERTAIN",
    );
    const reopened = buildStore(directory);
    await reopened.initialize();
    expect(await reopened.read((state) => state.storeRevision)).toBe(1);
  });

  it("does not advance the revision for a true no-op", async () => {
    const root = await tempRoot();
    const store = buildStore(join(root, "store"));
    await store.initialize();
    const result = await store.transact(STANDARD_INTENT, () => ({
      kind: "no-change",
      value: "same",
    }));
    expect(result.changed).toBe(false);
    expect(result.state.storeRevision).toBe(0);
  });
});

describe("transition authority", () => {
  it("prevents PLAN_APPLY from deleting execution history", () => {
    const before = createNoHistorySeed(instant.toISOString());
    (before.records.sessions as unknown as Record<string, { id: string }>)["session-1"] = {
      id: "session-1",
    };
    const after = structuredClone(before);
    delete after.records.sessions["session-1"];

    expect(() => assertJourneyStateTransition(before, after, { kind: "PLAN_APPLY" })).toThrow(
      StoreError,
    );
  });

  it("protects the seeded user from ordinary and plan transactions", () => {
    const before = createNoHistorySeed(instant.toISOString());
    const after = structuredClone(before);
    after.records.users["local-user"]!.name = "Changed";

    expect(() => assertJourneyStateTransition(before, after, STANDARD_INTENT)).toThrow(StoreError);
    expect(() => assertJourneyStateTransition(before, after, { kind: "PLAN_APPLY" })).toThrow(
      StoreError,
    );
  });

  it("serializes keys deterministically", () => {
    const state = createNoHistorySeed(instant.toISOString());
    state.records.users = {
      z: { id: "z", name: "Z", timeZone: "UTC", createdAt: instant.toISOString() },
      a: { id: "a", name: "A", timeZone: "UTC", createdAt: instant.toISOString() },
    };
    expect(serializeJourneyState(state).indexOf('"a"')).toBeLessThan(
      serializeJourneyState(state).indexOf('"z"'),
    );
  });

  it("allows execution projection changes while protecting plan fields and snapshots", () => {
    const before = createProductionSeed(instant.toISOString());
    const taskId = "2026-11-03-partial-failure";
    const afterStatus = structuredClone(before);
    afterStatus.records.tasks[taskId]!.status = "PAUSED";
    expect(() => assertJourneyStateTransition(before, afterStatus, STANDARD_INTENT)).not.toThrow();

    const withSnapshot = structuredClone(before);
    withSnapshot.records.tasks[taskId]!.planSnapshot = {
      capturedAt: instant.toISOString(),
      planRevision: 1,
      milestoneId: "q4-2026-w05",
      milestoneTitle: "Week 5",
      focusAreaId: "q4-2026-systems",
      focusAreaName: "Systems Reliability",
      plannedDate: "2026-11-03",
      title: "Partial failure",
      description: "Run an experiment where the network fails halfway through an operation.",
      tags: [],
      recommendationMode: "DEFAULT",
    };
    const changedSnapshot = structuredClone(withSnapshot);
    changedSnapshot.records.tasks[taskId]!.planSnapshot!.title = "Rewritten history";
    expect(() =>
      assertJourneyStateTransition(withSnapshot, changedSnapshot, STANDARD_INTENT),
    ).toThrow(StoreError);
  });

  it("protects ownership fields from plan apply and rejects unsafe deletion", () => {
    const before = createProductionSeed(instant.toISOString());
    const changedOwner = structuredClone(before);
    changedOwner.records.tasks["2026-11-03-partial-failure"]!.quarterId = "other-quarter";
    expect(() =>
      assertJourneyStateTransition(before, changedOwner, { kind: "PLAN_APPLY" }),
    ).toThrow(StoreError);

    const deletesReferencedTask = structuredClone(before);
    const taskId = "2026-11-03-partial-failure";
    deletesReferencedTask.records.tasks[taskId]!.planSnapshot = {
      capturedAt: instant.toISOString(),
      planRevision: 1,
      milestoneId: "q4-2026-w05",
      milestoneTitle: "Week 5",
      focusAreaId: "q4-2026-systems",
      focusAreaName: "Systems Reliability",
      plannedDate: "2026-11-03",
      title: "Partial failure",
      description: "Run an experiment where the network fails halfway through an operation.",
      tags: [],
      recommendationMode: "DEFAULT",
    };
    const afterDelete = structuredClone(deletesReferencedTask);
    delete afterDelete.records.tasks[taskId];
    expect(() =>
      assertJourneyStateTransition(deletesReferencedTask, afterDelete, { kind: "PLAN_APPLY" }),
    ).toThrow(StoreError);

    const pristine = createProductionSeed(instant.toISOString());
    const deletePristine = structuredClone(pristine);
    delete deletePristine.records.tasks[taskId];
    expect(() =>
      assertJourneyStateTransition(pristine, deletePristine, { kind: "PLAN_APPLY" }),
    ).not.toThrow();
  });
});
