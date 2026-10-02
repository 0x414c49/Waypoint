// @vitest-environment node
// FTS5 prefilter tests (ADR-0014): the index is app-maintained inside the
// store's write transaction (no triggers). searchRecords stays the
// authoritative scorer; these tests cover recall, filters, folding, stable
// ordering input, and fan-out maintenance only.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { createNoHistorySeed } from "../../domain/journey-state.js";
import { createProductionSeed } from "../../domain/production-seed.js";
import { FixedClock } from "../../ports/clock.js";
import { SequenceIdGenerator } from "../../ports/id-generator.js";
import { STANDARD_INTENT } from "../../ports/journey-store.js";
import { SqliteJourneyStore } from "./index.js";
import {
  collectAffectedFtsDocIds,
  composeAllFtsDocs,
  composeFtsDocForRecord,
} from "./fts-composer.js";

const roots: string[] = [];
const instant = new Date("2026-09-27T10:00:00.000Z");

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function openStore(seed = createProductionSeed): Promise<{ store: SqliteJourneyStore; directory: string }> {
  const root = await mkdtemp(join(tmpdir(), "sqlite-fts-test-"));
  roots.push(root);
  const directory = join(root, "store");
  const store = new SqliteJourneyStore({
    directory,
    clock: new FixedClock(instant),
    idGenerator: new SequenceIdGenerator(["init-directory", "store-id"]),
    seed,
  });
  await store.initialize();
  return { store, directory };
}

function openReader(directory: string): DatabaseSync {
  return new DatabaseSync(join(directory, "waypoint.db"), { readOnly: true });
}

function matchDocIds(
  db: DatabaseSync,
  term: string,
  filters: { userId?: string; quarterId?: string; group?: string } = {},
): string[] {
  const conditions = ["search_docs MATCH :term"];
  const params: Record<string, string> = { term };
  if (filters.userId) {
    conditions.push("user_id = :userId");
    params["userId"] = filters.userId;
  }
  if (filters.quarterId) {
    conditions.push("quarter_id = :quarterId");
    params["quarterId"] = filters.quarterId;
  }
  if (filters.group) {
    conditions.push("group_type = :group");
    params["group"] = filters.group;
  }
  const rows = db
    .prepare(`SELECT doc_id AS docId FROM search_docs WHERE ${conditions.join(" AND ")} ORDER BY bm25(search_docs)`)
    .all(params) as Array<{ docId: string }>;
  return rows.map((row) => row.docId);
}

function docBody(db: DatabaseSync, docId: string): string {
  const row = db.prepare("SELECT body AS body FROM search_docs WHERE doc_id = ?").get(docId) as
    | { body: string }
    | undefined;
  return row?.body ?? "";
}

describe("sqlite FTS prefilter", () => {
  it("finds production-seed docs with user, quarter, and group filters", async () => {
    const { store, directory } = await openStore();
    const db = openReader(directory);
    try {
      expect(matchDocIds(db, "reliability")).toContain("focus-area:q4-2026-systems");
      expect(matchDocIds(db, "reliability", { userId: "local-user" })).toContain(
        "focus-area:q4-2026-systems",
      );
      expect(matchDocIds(db, "reliability", { userId: "someone-else" })).not.toContain(
        "focus-area:q4-2026-systems",
      );
      expect(matchDocIds(db, "timeout", { quarterId: "q4-2026" })).toContain(
        "task:2026-10-06-timeouts",
      );
      expect(matchDocIds(db, "timeout", { quarterId: "other-quarter" })).not.toContain(
        "task:2026-10-06-timeouts",
      );
      expect(matchDocIds(db, "timeout", { group: "PLAN" })).toContain("task:2026-10-06-timeouts");
      expect(matchDocIds(db, "timeout", { group: "DECISION" })).not.toContain(
        "task:2026-10-06-timeouts",
      );
    } finally {
      db.close();
      store.close();
    }
  });

  it("folds diacritics on write and query", async () => {
    const { store, directory } = await openStore(createNoHistorySeed);
    await store.transact(STANDARD_INTENT, (draft) => {
      draft.records.journeyEntries["entry-cafe"] = {
        id: "entry-cafe",
        userId: "local-user",
        occurredAt: instant.toISOString(),
        timeZoneAtOccurrence: "Europe/Amsterdam",
        text: "Met for caf\u00e9 planning",
        tags: [],
        changedMyMind: false,
        createdAt: instant.toISOString(),
      };
      return { kind: "changed", value: 0 };
    });
    const db = openReader(directory);
    try {
      expect(matchDocIds(db, "cafe")).toContain("journey:entry-cafe");
      expect(matchDocIds(db, "caf\u00e9")).toContain("journey:entry-cafe");
    } finally {
      db.close();
      store.close();
    }
  });

  it("orders bm25 deterministically across repeated queries", async () => {
    const { store, directory } = await openStore();
    const db = openReader(directory);
    try {
      const first = matchDocIds(db, "week");
      expect(first.length).toBeGreaterThan(1);
      expect(matchDocIds(db, "week")).toEqual(first);
      expect(matchDocIds(db, "week")).toEqual(first);
    } finally {
      db.close();
      store.close();
    }
  });

  it("refreshes a journey doc when a related task title changes under plan authority", async () => {
    const { store, directory } = await openStore();
    const taskId = "2026-11-03-partial-failure";
    await store.transact(STANDARD_INTENT, (draft) => {
      const task = draft.records.tasks[taskId]!;
      const milestone = draft.records.milestones[task.milestoneId!]!;
      const quarter = draft.records.quarters[task.quarterId]!;
      const snapshotBase = { capturedAt: instant.toISOString(), planRevision: 1 };
      quarter.intentSnapshot = {
        ...snapshotBase,
        timeZoneAtCapture: "Europe/Amsterdam",
        title: quarter.title,
        startDate: quarter.startDate,
        endDate: quarter.endDate,
        successCriteria: quarter.successCriteria,
        focusAreas: [],
      };
      milestone.intentSnapshot = {
        ...snapshotBase,
        timeZoneAtCapture: "Europe/Amsterdam",
        title: milestone.title,
        startDate: milestone.startDate,
        endDate: milestone.endDate,
        mode: milestone.mode,
        position: milestone.position,
      };
      task.planSnapshot = {
        ...snapshotBase,
        milestoneId: milestone.id,
        milestoneTitle: milestone.title,
        plannedDate: task.plannedDate,
        title: task.title,
        tags: task.tags,
        recommendationMode: task.recommendationMode,
      };
      draft.records.journeyEntries["entry-fanout"] = {
        id: "entry-fanout",
        userId: "local-user",
        occurredAt: instant.toISOString(),
        timeZoneAtOccurrence: "Europe/Amsterdam",
        text: "Linked thought",
        tags: [],
        relatedTaskId: taskId,
        changedMyMind: false,
        createdAt: instant.toISOString(),
      };
      return { kind: "changed", value: 0 };
    });
    await store.transact({ kind: "PLAN_APPLY" }, (draft) => {
      draft.records.tasks[taskId]!.title = "Renamed orchestration drill";
      return { kind: "changed", value: 0 };
    });

    const db = openReader(directory);
    try {
      expect(docBody(db, "journey:entry-fanout")).toContain("Renamed orchestration drill");
      expect(matchDocIds(db, "orchestration")).toContain("journey:entry-fanout");
      expect(matchDocIds(db, "orchestration")).toContain(`task:${taskId}`);
    } finally {
      db.close();
      store.close();
    }
  });

  it("folds decision reviews into the parent decision doc", async () => {
    const { store, directory } = await openStore(createNoHistorySeed);
    await store.transact(STANDARD_INTENT, (draft) => {
      draft.records.decisionRecords["decision-1"] = {
        id: "decision-1",
        userId: "local-user",
        title: "Pick a queue",
        decisionDate: "2026-09-27",
        status: "ACCEPTED",
        context: "Throughput context",
        constraints: [],
        options: [],
        decision: "Use the durable queue",
        assumptions: [],
        createdAt: instant.toISOString(),
        updatedAt: instant.toISOString(),
      };
      return { kind: "changed", value: 0 };
    });
    await store.transact(STANDARD_INTENT, (draft) => {
      draft.records.decisionReviews["review-1"] = {
        id: "review-1",
        decisionId: "decision-1",
        sequence: 1,
        reviewedAt: "2026-09-28T10:00:00.000Z",
        timeZoneAtReview: "Europe/Amsterdam",
        outcome: "HOLDS",
        notes: "throughput doubled as predicted",
        createdAt: "2026-09-28T10:00:00.000Z",
      };
      return { kind: "changed", value: 0 };
    });

    const db = openReader(directory);
    try {
      expect(docBody(db, "decision:decision-1")).toContain("throughput doubled as predicted");
      expect(matchDocIds(db, "throughput", { group: "DECISION" })).toContain("decision:decision-1");
    } finally {
      db.close();
      store.close();
    }
  });

  it("removes docs for deleted journey entries", async () => {
    const { store, directory } = await openStore(createNoHistorySeed);
    await store.transact(STANDARD_INTENT, (draft) => {
      draft.records.journeyEntries["entry-gone"] = {
        id: "entry-gone",
        userId: "local-user",
        occurredAt: instant.toISOString(),
        timeZoneAtOccurrence: "Europe/Amsterdam",
        text: "transient ephemera",
        tags: [],
        changedMyMind: false,
        createdAt: instant.toISOString(),
      };
      return { kind: "changed", value: 0 };
    });
    let db = openReader(directory);
    expect(matchDocIds(db, "ephemera")).toContain("journey:entry-gone");
    db.close();

    await store.transact({ kind: "JOURNEY_DELETE", journeyEntryId: "entry-gone" }, (draft) => {
      delete draft.records.journeyEntries["entry-gone"];
      return { kind: "changed", value: 0 };
    });
    db = openReader(directory);
    try {
      expect(matchDocIds(db, "ephemera")).not.toContain("journey:entry-gone");
    } finally {
      db.close();
      store.close();
    }
  });

  it("is maintained by the app: the schema carries no triggers", async () => {
    const { store, directory } = await openStore();
    const db = openReader(directory);
    try {
      const triggers = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger'").get() as {
        n: number;
      };
      expect(triggers.n).toBe(0);
    } finally {
      db.close();
      store.close();
    }
  });
});

describe("fts composer units", () => {
  it("composes one doc per source row and the full set for the seed", () => {
    const state = createProductionSeed(instant.toISOString());
    const quarterId = Object.keys(state.records.quarters)[0]!;
    const taskId = Object.keys(state.records.tasks)[0]!;
    expect(composeFtsDocForRecord(state, "quarters", quarterId)?.contentType).toBe("QUARTER");
    expect(composeFtsDocForRecord(state, "tasks", taskId)?.contentType).toBe("TASK");
    expect(composeFtsDocForRecord(state, "tasks", "missing")).toBeUndefined();
    expect(composeFtsDocForRecord(state, "journeyEntries", "missing")).toBeUndefined();

    const docs = composeAllFtsDocs(state);
    expect(docs).toHaveLength(
      Object.keys(state.records.quarters).length +
        Object.keys(state.records.focusAreas).length +
        Object.keys(state.records.milestones).length +
        Object.keys(state.records.tasks).length,
    );
    expect(new Set(docs.map((doc) => doc.docId)).size).toBe(docs.length);
  });

  it("maps review changes to the parent decision doc and fans task changes out to journey docs", () => {
    const before = createNoHistorySeed(instant.toISOString());
    const after = structuredClone(before);
    after.records.tasks["task-1"] = {
      id: "task-1",
      quarterId: "q1",
      plannedDate: "2026-09-27",
      title: "Renamed",
      tags: [],
      position: 0,
      recommendationMode: "DEFAULT",
      status: "NOT_STARTED",
      createdAt: instant.toISOString(),
      updatedAt: instant.toISOString(),
    };
    after.records.journeyEntries["entry-1"] = {
      id: "entry-1",
      userId: "local-user",
      occurredAt: instant.toISOString(),
      timeZoneAtOccurrence: "Europe/Amsterdam",
      text: "note",
      tags: [],
      relatedTaskId: "task-1",
      changedMyMind: false,
      createdAt: instant.toISOString(),
    };
    after.records.decisionReviews["review-1"] = {
      id: "review-1",
      decisionId: "decision-9",
      sequence: 1,
      reviewedAt: instant.toISOString(),
      timeZoneAtReview: "Europe/Amsterdam",
      outcome: "HOLDS",
      createdAt: instant.toISOString(),
    };
    const affected = collectAffectedFtsDocIds(
      before,
      after,
      new Map([
        ["tasks", new Set(["task-1"])],
        ["journeyEntries", new Set(["entry-1"])],
        ["decisionReviews", new Set(["review-1"])],
      ]),
    );
    expect(affected).toEqual(new Set(["task:task-1", "journey:entry-1", "decision:decision-9"]));
  });
});
