// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createProductionSeed } from "../../domain/production-seed.js";
import { captureTaskPlanContext } from "../history/capture-plan-context.js";
import { localDateStartInstant } from "../dashboard/temporal.js";
import { projectMilestoneSummary } from "./milestone-summary.js";

describe("milestone temporal projection", () => {
  it("uses the exact captured-timezone cutoff while attributing events by their own occurrence timezone", () => {
    const state = createProductionSeed("2026-09-27T10:00:00.000Z");
    const task = state.records.tasks["2026-11-03-partial-failure"]!;
    captureTaskPlanContext(state, task, "Europe/Amsterdam", "2026-11-03T17:00:00.000Z");
    state.records.sessions["session-cutoff"] = { id: "session-cutoff", taskId: task.id, startedAt: "2026-11-06T22:30:00.000Z", endedAt: "2026-11-06T23:00:00.000Z", timeZoneAtStart: "Europe/Amsterdam", createdAt: "2026-11-06T22:30:00.000Z", updatedAt: "2026-11-06T23:00:00.000Z" };
    state.records.taskLifecycleEvents["finish-after-cutoff"] = { id: "finish-after-cutoff", taskId: task.id, sequence: 1, type: "FINISHED", occurredAt: "2026-11-06T23:30:00.000Z", timeZoneAtOccurrence: "UTC", createdAt: "2026-11-06T23:30:00.000Z" };
    state.records.dailyReviews["review-after-cutoff"] = { id: "review-after-cutoff", taskId: task.id, finishEventId: "finish-after-cutoff", outcome: "PARTIAL", createdAt: "2026-11-06T23:30:00.000Z", updatedAt: "2026-11-06T23:30:00.000Z" };
    task.status = "FINISHED";
    const reopenedTask = state.records.tasks["2026-11-04-adr-3-consistency"]!;
    state.records.taskLifecycleEvents["skip-during-period"] = { id: "skip-during-period", taskId: reopenedTask.id, sequence: 1, type: "SKIPPED", occurredAt: "2026-11-04T12:00:00.000Z", timeZoneAtOccurrence: "Europe/Amsterdam", createdAt: "2026-11-04T12:00:00.000Z" };
    state.records.taskLifecycleEvents["reopen-during-period"] = { id: "reopen-during-period", taskId: reopenedTask.id, sequence: 2, type: "REOPENED", occurredAt: "2026-11-05T12:00:00.000Z", timeZoneAtOccurrence: "Europe/Amsterdam", undoesEventId: "skip-during-period", createdAt: "2026-11-05T12:00:00.000Z" };
    const summary = projectMilestoneSummary(state, "local-user", "q4-2026-w05", "2026-11-07T12:00:00.000Z");
    const row = summary.taskRows.find((item) => item.task.id === task.id)!;
    expect(row.statusAtPeriodEnd).toBe("PAUSED");
    expect(row.currentStatus).toBe("FINISHED");
    expect(summary.outcomes.partial).toBe(1);
    expect(summary.eventsDuringPeriod).toMatchObject({ finished: 1, skipped: 1, reopened: 1 });
  });

  it("resolves local midnight exactly across Amsterdam daylight-saving changes", () => {
    expect(new Date(localDateStartInstant("2026-03-29", "Europe/Amsterdam")).toISOString()).toBe("2026-03-28T23:00:00.000Z");
    expect(new Date(localDateStartInstant("2026-03-30", "Europe/Amsterdam")).toISOString()).toBe("2026-03-29T22:00:00.000Z");
    expect(new Date(localDateStartInstant("2026-10-25", "Europe/Amsterdam")).toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(new Date(localDateStartInstant("2026-10-26", "Europe/Amsterdam")).toISOString()).toBe("2026-10-25T23:00:00.000Z");
  });
});
