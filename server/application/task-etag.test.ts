// @vitest-environment node
import { describe, expect, it } from "vitest";
import { serializeJourneyState } from "../adapters/json-store/index.js";
import { createProductionSeed } from "../domain/production-seed.js";
import type { JourneyState } from "../domain/journey-state.js";
import { taskEtag } from "./task-etag.js";

describe("task ETags", () => {
  it("remain stable when persistence canonicalizes record-map key order", () => {
    const state = createProductionSeed("2026-09-27T10:00:00.000Z");
    const task = state.records.tasks["2026-11-03-partial-failure"]!;
    state.records.sessions["session-z"] = {
      id: "session-z",
      taskId: task.id,
      startedAt: "2026-11-03T17:00:00.000Z",
      endedAt: "2026-11-03T17:10:00.000Z",
      timeZoneAtStart: "Europe/Amsterdam",
      createdAt: "2026-11-03T17:00:00.000Z",
      updatedAt: "2026-11-03T17:10:00.000Z",
    };
    state.records.sessions["session-a"] = {
      id: "session-a",
      taskId: task.id,
      startedAt: "2026-11-03T17:10:00.000Z",
      timeZoneAtStart: "Europe/Amsterdam",
      createdAt: "2026-11-03T17:10:00.000Z",
      updatedAt: "2026-11-03T17:10:00.000Z",
    };
    state.records.taskLifecycleEvents["event-z"] = {
      id: "event-z",
      taskId: task.id,
      sequence: 1,
      type: "FINISHED",
      occurredAt: "2026-11-03T17:20:00.000Z",
      timeZoneAtOccurrence: "Europe/Amsterdam",
      createdAt: "2026-11-03T17:20:00.000Z",
    };
    state.records.taskLifecycleEvents["event-a"] = {
      id: "event-a",
      taskId: task.id,
      sequence: 2,
      type: "REOPENED",
      occurredAt: "2026-11-03T17:21:00.000Z",
      timeZoneAtOccurrence: "Europe/Amsterdam",
      undoesEventId: "event-z",
      createdAt: "2026-11-03T17:21:00.000Z",
    };

    const beforeWrite = taskEtag(state, task);
    const reloaded = JSON.parse(serializeJourneyState(state)) as JourneyState;
    const afterReload = taskEtag(reloaded, reloaded.records.tasks[task.id]!);
    expect(afterReload).toBe(beforeWrite);
  });
});
