// @vitest-environment node
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { createProductionSeed } from "../domain/production-seed.js";
import { projectDashboard } from "./dashboard/dashboard.js";
import { projectJourneyTimeline } from "./journey/journey-timeline.js";

function personalScaleState() {
  const state = createProductionSeed("2026-09-27T10:00:00.000Z");
  const quarterTemplate = Object.values(state.records.quarters)[0]!;
  const milestoneTemplate = Object.values(state.records.milestones)[0]!;
  const taskTemplate = Object.values(state.records.tasks)[0]!;
  state.records.quarters = {};
  state.records.focusAreas = {};
  state.records.milestones = {};
  state.records.tasks = {};
  state.records.sessions = {};
  state.records.taskLifecycleEvents = {};
  state.records.dailyReviews = {};
  state.records.journeyEntries = {};

  for (let quarterIndex = 0; quarterIndex < 8; quarterIndex += 1) {
    const year = 2020 + quarterIndex;
    const quarterId = `performance-quarter-${quarterIndex}`;
    const milestoneId = `performance-milestone-${quarterIndex}`;
    state.records.quarters[quarterId] = {
      ...structuredClone(quarterTemplate), id: quarterId, title: `Quarter ${quarterIndex + 1}`,
      startDate: `${year}-01-01`, endDate: `${year}-12-31`, planRevision: 1,
    };
    state.records.milestones[milestoneId] = {
      ...structuredClone(milestoneTemplate), id: milestoneId, quarterId,
      title: `Milestone ${quarterIndex + 1}`, startDate: `${year}-01-01`, endDate: `${year}-12-31`, position: 0,
    };
    for (let taskIndex = 0; taskIndex < 125; taskIndex += 1) {
      const taskId = `performance-task-${quarterIndex}-${taskIndex}`;
      const task = structuredClone(taskTemplate);
      task.id = taskId;
      task.quarterId = quarterId;
      task.milestoneId = milestoneId;
      delete task.focusAreaId;
      delete task.planSnapshot;
      delete task.continuationOfTaskId;
      task.plannedDate = `${year}-11-03`;
      task.title = `Task ${quarterIndex}-${taskIndex}`;
      task.position = taskIndex;
      task.status = "PAUSED";
      state.records.tasks[taskId] = task;
      for (let sessionIndex = 0; sessionIndex < 2; sessionIndex += 1) {
        const minute = String(sessionIndex * 10).padStart(2, "0");
        const endMinute = String(sessionIndex * 10 + 5).padStart(2, "0");
        const id = `performance-session-${quarterIndex}-${taskIndex}-${sessionIndex}`;
        state.records.sessions[id] = {
          id, taskId, startedAt: `2026-11-03T16:${minute}:00.000Z`, endedAt: `2026-11-03T16:${endMinute}:00.000Z`,
          timeZoneAtStart: "Europe/Amsterdam", createdAt: `2026-11-03T16:${minute}:00.000Z`, updatedAt: `2026-11-03T16:${endMinute}:00.000Z`,
        };
        const entryId = `performance-thought-${quarterIndex}-${taskIndex}-${sessionIndex}`;
        state.records.journeyEntries[entryId] = {
          id: entryId, userId: "local-user", occurredAt: `2026-11-03T16:${minute}:00.000Z`, timeZoneAtOccurrence: "Europe/Amsterdam",
          text: `Thought ${quarterIndex}-${taskIndex}-${sessionIndex}`, tags: [], changedMyMind: false, relatedTaskId: taskId,
          createdAt: `2026-11-03T16:${minute}:00.000Z`,
        };
      }
    }
  }
  return state;
}

function p95(samples: number[]): number {
  return [...samples].sort((left, right) => left - right)[Math.ceil(samples.length * 0.95) - 1]!;
}

describe("personal-scale read budgets", () => {
  it("keeps warm Today and Journey projections bounded at the accepted dataset size", () => {
    const state = personalScaleState();
    const now = new Date("2026-11-03T17:00:00.000Z");
    projectDashboard(state, "local-user", now);
    projectJourneyTimeline(state, "local-user", { limit: 50 });
    const todaySamples: number[] = [];
    const journeySamples: number[] = [];
    for (let index = 0; index < 20; index += 1) {
      let started = performance.now();
      projectDashboard(state, "local-user", now);
      todaySamples.push(performance.now() - started);
      started = performance.now();
      projectJourneyTimeline(state, "local-user", { limit: 50 });
      journeySamples.push(performance.now() - started);
    }
    expect(Object.keys(state.records.quarters)).toHaveLength(8);
    expect(Object.keys(state.records.tasks)).toHaveLength(1_000);
    expect(Object.keys(state.records.sessions)).toHaveLength(2_000);
    expect(Object.keys(state.records.journeyEntries)).toHaveLength(2_000);
    expect(p95(todaySamples)).toBeLessThan(200);
    expect(p95(journeySamples)).toBeLessThan(200);
  });
});
