import { describe, expect, it } from "vitest";
import { createProductionSeed } from "../../domain/production-seed.js";
import type { JourneyState } from "../../domain/journey-state.js";
import { searchRecords } from "./search.js";

const writtenAt = "2026-09-27T10:00:00.000Z";

function stateWithEntries(): JourneyState {
  const state = createProductionSeed(writtenAt);
  state.records.journeyEntries["thought-search"] = {
    id: "thought-search", userId: "local-user", occurredAt: writtenAt, timeZoneAtOccurrence: "Europe/Amsterdam",
    text: "We learned that an atomic retry needs one owner.", tags: ["resilience"], changedMyMind: false,
    createdAt: writtenAt,
  };
  state.records.decisionRecords["decision-search"] = {
    id: "decision-search", userId: "local-user", quarterId: "q4-2026", title: "Keep retry ownership local",
    status: "DRAFT", context: "An atomic retry needs one owner.", constraints: [], options: [], assumptions: [],
    createdAt: writtenAt, updatedAt: writtenAt,
  };
  state.records.journeyEntries["private-thought"] = {
    id: "private-thought", userId: "another-user", occurredAt: writtenAt, timeZoneAtOccurrence: "Europe/Amsterdam",
    text: "Atomic retry private material", tags: [], changedMyMind: false, createdAt: writtenAt,
  };
  return state;
}

describe("global search projection", () => {
  it("finds plan work, Journey thoughts, and Decision reasoning in type groups", () => {
    const result = searchRecords(stateWithEntries(), "local-user", { query: "atomic retry", limit: 25 });

    expect(result.groups.map((group) => group.type)).toEqual(["JOURNEY", "DECISION"]);
    expect(result.groups.find((group) => group.type === "JOURNEY")?.items[0]).toMatchObject({
      contentType: "THOUGHT", id: "thought-search", journeyEntryId: "thought-search", quarterId: null,
    });
    expect(result.groups.find((group) => group.type === "DECISION")?.items[0]).toMatchObject({
      contentType: "DECISION", id: "decision-search", decisionId: "decision-search", quarterId: "q4-2026",
    });
    expect(JSON.stringify(result)).not.toContain("private-thought");
  });

  it("returns canonical plan identifiers and paginates with query-bound cursors", () => {
    const state = createProductionSeed(writtenAt);
    const first = searchRecords(state, "local-user", { query: "week", type: "PLAN", limit: 4 });
    expect(first.groups[0]?.items).toHaveLength(4);
    expect(first.groups[0]?.items.every((item) => item.contentType === "MILESTONE" && item.quarterId === "q4-2026")).toBe(true);
    expect(first.nextCursor).not.toBeNull();

    const second = searchRecords(state, "local-user", { query: "week", type: "PLAN", limit: 4, cursor: first.nextCursor! });
    const ids = [...first.groups[0]!.items, ...second.groups[0]!.items].map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(() => searchRecords(state, "local-user", { query: "different", type: "PLAN", limit: 4, cursor: first.nextCursor! })).toThrow("Search again");
  });

  it("matches plan Task content case-insensitively and rejects a blank query", () => {
    const state = createProductionSeed(writtenAt);
    const result = searchRecords(state, "local-user", { query: "IDEMPOTENCY", limit: 10 });
    expect(result.groups.flatMap((group) => group.items)).toContainEqual(expect.objectContaining({
      contentType: "TASK", id: "2026-10-20-idempotency", taskId: "2026-10-20-idempotency",
    }));
    expect(() => searchRecords(state, "local-user", { query: "   ", limit: 10 })).toThrow("non-space");
  });

  it("applies the Quarter filter through a thought’s linked Decision", () => {
    const state = stateWithEntries();
    state.records.journeyEntries["thought-via-decision"] = {
      id: "thought-via-decision", userId: "local-user", occurredAt: writtenAt, timeZoneAtOccurrence: "Europe/Amsterdam",
      text: "This insight is connected through its Decision.", tags: [], relatedDecisionId: "decision-search",
      changedMyMind: false, createdAt: writtenAt,
    };

    const result = searchRecords(state, "local-user", { query: "connected", quarterId: "q4-2026", limit: 25 });

    expect(result.groups.find((group) => group.type === "JOURNEY")?.items[0]).toMatchObject({
      id: "thought-via-decision", decisionId: "decision-search", quarterId: "q4-2026",
    });
  });
});
