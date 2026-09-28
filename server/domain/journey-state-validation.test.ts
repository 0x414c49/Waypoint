// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createProductionSeed } from "./production-seed.js";
import { validateJourneyState, type JourneyState, type TaskRecord } from "./journey-state.js";

const instant = "2026-10-05T10:00:00.000Z";

function addSnapshots(state: JourneyState, task: TaskRecord): void {
  const quarter = state.records.quarters[task.quarterId]!;
  const milestone = state.records.milestones[task.milestoneId!]!;
  task.planSnapshot = {
    capturedAt: instant,
    planRevision: quarter.planRevision,
    ...(task.focusAreaId ? { focusAreaId: task.focusAreaId } : {}),
    ...(task.focusAreaId ? { focusAreaName: state.records.focusAreas[task.focusAreaId]!.name } : {}),
    milestoneId: milestone.id,
    milestoneTitle: milestone.title,
    plannedDate: task.plannedDate,
    title: task.title,
    ...(task.description ? { description: task.description } : {}),
    tags: task.tags,
    recommendationMode: task.recommendationMode,
  };
  milestone.intentSnapshot = {
    capturedAt: instant,
    planRevision: quarter.planRevision,
    timeZoneAtCapture: "Europe/Amsterdam",
    title: milestone.title,
    startDate: milestone.startDate,
    endDate: milestone.endDate,
    mode: milestone.mode,
    position: milestone.position,
  };
  quarter.intentSnapshot = {
    capturedAt: instant,
    planRevision: quarter.planRevision,
    timeZoneAtCapture: "Europe/Amsterdam",
    title: quarter.title,
    ...(quarter.description ? { description: quarter.description } : {}),
    ...(quarter.mantra ? { mantra: quarter.mantra } : {}),
    startDate: quarter.startDate,
    endDate: quarter.endDate,
    successCriteria: quarter.successCriteria,
    focusAreas: Object.values(state.records.focusAreas)
      .filter((area) => area.quarterId === quarter.id)
      .map((area) => ({
        id: area.id,
        name: area.name,
        ...(area.targetMinutes ? { targetMinutes: area.targetMinutes } : {}),
      })),
  };
}

describe("JourneyState execution invariants", () => {
  it("requires all three intent snapshots when task history begins", () => {
    const state = createProductionSeed(instant);
    const task = state.records.tasks["2026-10-05-go-foundations"]!;
    task.status = "IN_PROGRESS";
    state.records.sessions["session-one"] = {
      id: "session-one",
      taskId: task.id,
      startedAt: instant,
      timeZoneAtStart: "Europe/Amsterdam",
      createdAt: instant,
      updatedAt: instant,
    };

    const errors = validateJourneyState(state);
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining("planSnapshot: required"),
      expect.stringContaining("milestones/q4-2026-w01/intentSnapshot: required"),
      expect.stringContaining("quarters/q4-2026/intentSnapshot: required"),
    ]));
  });

  it("detects an active interval overlapping a prior closed interval", () => {
    const state = createProductionSeed(instant);
    const first = state.records.tasks["2026-10-05-go-foundations"]!;
    const second = state.records.tasks["2026-10-06-timeouts"]!;
    addSnapshots(state, first);
    addSnapshots(state, second);
    first.status = "PAUSED";
    second.status = "IN_PROGRESS";
    state.records.sessions.closed = {
      id: "closed",
      taskId: first.id,
      startedAt: "2026-10-05T10:00:00.000Z",
      endedAt: "2026-10-05T11:00:00.000Z",
      timeZoneAtStart: "Europe/Amsterdam",
      createdAt: instant,
      updatedAt: instant,
    };
    state.records.sessions.active = {
      id: "active",
      taskId: second.id,
      startedAt: "2026-10-05T10:30:00.000Z",
      timeZoneAtStart: "Europe/Amsterdam",
      createdAt: instant,
      updatedAt: instant,
    };

    expect(validateJourneyState(state)).toContainEqual(expect.stringContaining("sessions closed and active overlap"));
  });

  it("derives FINISHED from the effective terminal event", () => {
    const state = createProductionSeed(instant);
    const task = state.records.tasks["2026-10-05-go-foundations"]!;
    addSnapshots(state, task);
    state.records.taskLifecycleEvents.finished = {
      id: "finished",
      taskId: task.id,
      sequence: 1,
      type: "FINISHED",
      occurredAt: instant,
      timeZoneAtOccurrence: "Europe/Amsterdam",
      createdAt: instant,
    };
    state.records.dailyReviews.review = {
      id: "review",
      taskId: task.id,
      finishEventId: "finished",
      outcome: "ACHIEVED",
      createdAt: instant,
      updatedAt: instant,
    };

    expect(validateJourneyState(state)).toContainEqual(expect.stringContaining("expected FINISHED from history"));
    task.status = "FINISHED";
    expect(validateJourneyState(state)).toEqual([]);
  });

  it("rejects an active session beside an effective terminal closure", () => {
    const state = createProductionSeed(instant);
    const task = state.records.tasks["2026-10-05-go-foundations"]!;
    addSnapshots(state, task);
    task.status = "FINISHED";
    state.records.sessions.active = {
      id: "active",
      taskId: task.id,
      startedAt: "2026-10-05T09:00:00.000Z",
      timeZoneAtStart: "Europe/Amsterdam",
      createdAt: instant,
      updatedAt: instant,
    };
    state.records.taskLifecycleEvents.finished = {
      id: "finished",
      taskId: task.id,
      sequence: 1,
      type: "FINISHED",
      occurredAt: instant,
      timeZoneAtOccurrence: "Europe/Amsterdam",
      createdAt: instant,
    };
    state.records.dailyReviews.review = {
      id: "review",
      taskId: task.id,
      finishEventId: "finished",
      outcome: "PARTIAL",
      createdAt: instant,
      updatedAt: instant,
    };

    expect(validateJourneyState(state)).toContainEqual(
      expect.stringContaining("active Session cannot coexist with terminal event"),
    );
  });

  it("requires lifecycle occurrence time to follow sequence even after reopen", () => {
    const state = createProductionSeed(instant);
    const task = state.records.tasks["2026-10-05-go-foundations"]!;
    addSnapshots(state, task);
    task.status = "SKIPPED";
    state.records.taskLifecycleEvents.first = {
      id: "first",
      taskId: task.id,
      sequence: 1,
      type: "SKIPPED",
      occurredAt: "2026-10-05T10:00:00.000Z",
      timeZoneAtOccurrence: "Europe/Amsterdam",
      createdAt: instant,
    };
    state.records.taskLifecycleEvents.reopened = {
      id: "reopened",
      taskId: task.id,
      sequence: 2,
      type: "REOPENED",
      occurredAt: "2026-10-05T11:00:00.000Z",
      timeZoneAtOccurrence: "Europe/Amsterdam",
      undoesEventId: "first",
      createdAt: instant,
    };
    state.records.taskLifecycleEvents.second = {
      id: "second",
      taskId: task.id,
      sequence: 3,
      type: "SKIPPED",
      occurredAt: "2026-10-05T09:00:00.000Z",
      timeZoneAtOccurrence: "Europe/Amsterdam",
      createdAt: instant,
    };

    expect(validateJourneyState(state)).toContainEqual(
      expect.stringContaining("occurredAt must not move backwards with sequence"),
    );
  });
});
