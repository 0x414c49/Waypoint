// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createProductionSeed } from "../../domain/production-seed.js";
import { projectDashboard } from "./dashboard.js";
import { closedSessionSegments } from "./temporal.js";

const seededAt = "2026-09-27T10:00:00.000Z";

describe("Today dashboard projection", () => {
  it("renders the scheduled Default item as Ready with a zeroed activity preview", () => {
    const dashboard = projectDashboard(
      createProductionSeed(seededAt),
      "local-user",
      new Date("2026-11-03T17:00:00.000Z"),
    );
    expect(dashboard.state).toBe("READY");
    expect(dashboard.hero.task?.id).toBe("2026-11-03-partial-failure");
    expect(dashboard.activityPreview.days).toHaveLength(14);
    expect(dashboard.activityPreview.days.every((day) => day.sessionSeconds === 0)).toBe(true);
  });

  it("recovers removed paused work and prefers a Default item for Up next", () => {
    const state = createProductionSeed(seededAt);
    const paused = state.records.tasks["2026-11-02-rust-foundations"]!;
    paused.status = "PAUSED";
    paused.removedFromPlanAt = "2026-11-03T08:00:00.000Z";
    state.records.sessions["session-paused"] = {
      id: "session-paused",
      taskId: paused.id,
      startedAt: "2026-11-02T17:00:00.000Z",
      endedAt: "2026-11-02T17:30:00.000Z",
      timeZoneAtStart: "Europe/Amsterdam",
      createdAt: "2026-11-02T17:00:00.000Z",
      updatedAt: "2026-11-02T17:30:00.000Z",
    };
    const conditional = state.records.tasks["2026-11-06-ai-agent-protocols"]!;
    conditional.plannedDate = "2026-11-03";
    conditional.position = 0;

    const dashboard = projectDashboard(
      state,
      "local-user",
      new Date("2026-11-03T17:00:00.000Z"),
    );
    expect(dashboard.state).toBe("PAUSED");
    expect(dashboard.hero.task?.id).toBe(paused.id);
    expect(dashboard.upNext?.task.id).toBe("2026-11-03-partial-failure");
    expect(dashboard.upNext?.reason).toBe("SCHEDULED_TODAY");
  });

  it("keeps active time out of contribution cells until the session closes", () => {
    const state = createProductionSeed(seededAt);
    const task = state.records.tasks["2026-11-03-partial-failure"]!;
    task.status = "IN_PROGRESS";
    state.records.sessions["session-active"] = {
      id: "session-active",
      taskId: task.id,
      startedAt: "2026-11-03T16:40:00.000Z",
      timeZoneAtStart: "Europe/Amsterdam",
      intentionMinutes: 10,
      createdAt: "2026-11-03T16:40:00.000Z",
      updatedAt: "2026-11-03T16:40:00.000Z",
    };
    const dashboard = projectDashboard(
      state,
      "local-user",
      new Date("2026-11-03T17:00:00.000Z"),
    );
    expect(dashboard.state).toBe("RUNNING");
    expect(dashboard.activeSession?.sessionElapsedSecondsAtGeneratedAt).toBe(1_200);
    expect(dashboard.activityPreview.days.at(-1)?.sessionSeconds).toBe(0);
  });
});
describe("temporal attribution", () => {
  it("splits a closed interval across the captured local midnight", () => {
    const parts = closedSessionSegments({
      id: "session-midnight",
      taskId: "task",
      startedAt: "2026-11-03T22:50:00.000Z",
      endedAt: "2026-11-03T23:20:00.000Z",
      timeZoneAtStart: "Europe/Amsterdam",
      createdAt: "2026-11-03T22:50:00.000Z",
      updatedAt: "2026-11-03T23:20:00.000Z",
    });
    expect(parts).toEqual([
      { date: "2026-11-03", seconds: 600 },
      { date: "2026-11-04", seconds: 1_200 },
    ]);
  });
});
