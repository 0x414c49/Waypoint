// @vitest-environment node
import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { RandomIdGenerator } from "../ports/id-generator.js";
import { FixedClock } from "../ports/clock.js";
import type { JourneyStore } from "../ports/journey-store.js";
import type { CurrentUserProvider } from "../adapters/local-current-user-provider.js";
import { PlanCommandService } from "./plans/plan-command-service.js";
import { createProductionSeed } from "../domain/production-seed.js";
import { projectDecisionList } from "./decisions/decision-projection.js";
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
  state.records.decisionRecords = {};
  state.records.decisionReviews = {};

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
      const decisionId = `performance-decision-${quarterIndex}-${taskIndex}`;
      state.records.decisionRecords[decisionId] = {
        id: decisionId, userId: "local-user", quarterId, relatedTaskId: taskId,
        title: `Decision ${quarterIndex}-${taskIndex}`, decisionDate: "2026-11-03",
        status: "ACCEPTED", context: "Personal-scale context.", constraints: [], options: [],
        decision: "Keep the boundary explicit.", assumptions: [], initialReviewDate: "2026-11-03",
        createdAt: "2026-11-03T16:00:00.000Z", updatedAt: "2026-11-03T16:01:00.000Z",
      };
      for (let reviewIndex = 0; reviewIndex < 2; reviewIndex += 1) {
        const reviewId = `performance-review-${quarterIndex}-${taskIndex}-${reviewIndex}`;
        state.records.decisionReviews[reviewId] = {
          id: reviewId, decisionId, sequence: reviewIndex + 1,
          reviewedAt: `2026-11-03T16:0${reviewIndex}:00.000Z`, timeZoneAtReview: "Europe/Amsterdam",
          outcome: "HOLDS", nextReviewDate: "2026-12-01",
          createdAt: `2026-11-03T16:0${reviewIndex}:00.000Z`,
        };
      }
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
    projectDecisionList(state, "local-user", { limit: 50, today: "2026-11-03" });
    const todaySamples: number[] = [];
    const journeySamples: number[] = [];
    const decisionSamples: number[] = [];
    for (let index = 0; index < 20; index += 1) {
      let started = performance.now();
      projectDashboard(state, "local-user", now);
      todaySamples.push(performance.now() - started);
      started = performance.now();
      projectJourneyTimeline(state, "local-user", { limit: 50 });
      journeySamples.push(performance.now() - started);
      started = performance.now();
      projectDecisionList(state, "local-user", { limit: 50, today: "2026-11-03" });
      decisionSamples.push(performance.now() - started);
    }
    expect(Object.keys(state.records.quarters)).toHaveLength(8);
    expect(Object.keys(state.records.tasks)).toHaveLength(1_000);
    expect(Object.keys(state.records.sessions)).toHaveLength(2_000);
    expect(Object.keys(state.records.journeyEntries)).toHaveLength(2_000);
    expect(Object.keys(state.records.decisionRecords)).toHaveLength(1_000);
    expect(Object.keys(state.records.decisionReviews)).toHaveLength(2_000);
    expect(p95(todaySamples)).toBeLessThan(200);
    expect(p95(journeySamples)).toBeLessThan(200);
    expect(p95(decisionSamples)).toBeLessThan(200);
  });

  it("keeps unchanged Quarter plan preview bounded with 8 Quarters and 1,000 Tasks", async () => {
    const state = personalScaleState();
    const quarter = state.records.quarters["performance-quarter-0"]!;
    const milestone = Object.values(state.records.milestones).find((item) => item.quarterId === quarter.id)!;
    const planYaml = stringify({
      version: 1,
      quarter: { id: quarter.id, title: quarter.title, start: quarter.startDate, end: quarter.endDate },
      focusAreas: [],
      milestones: [{ id: milestone.id, title: milestone.title, ...(milestone.description ? { description: milestone.description } : {}), start: milestone.startDate, end: milestone.endDate, mode: milestone.mode }],
      tasks: Object.values(state.records.tasks).filter((task) => task.quarterId === quarter.id).sort((a, b) => a.position - b.position).map((task) => ({
        id: task.id, milestoneId: task.milestoneId!, date: task.plannedDate, title: task.title,
        ...(task.description ? { description: task.description } : {}),
        ...(task.plannedMinutes ? { plannedMinutes: task.plannedMinutes } : {}),
        tags: task.tags, recommendationMode: task.recommendationMode,
        ...(task.decisionPrompt ? { decisionPrompt: task.decisionPrompt } : {}),
      })),
    });
    const store = {
      read: async <T>(project: (snapshot: typeof state) => T) => project(state),
      transact: async () => { throw new Error("This read-budget scenario does not apply a plan."); },
    } as unknown as JourneyStore;
    const currentUser = { getCurrentUserId: async () => "local-user" } as CurrentUserProvider;
    const service = new PlanCommandService(store, currentUser, new FixedClock(new Date("2026-11-03T17:00:00.000Z")), new RandomIdGenerator());
    await service.preview(planYaml);
    const samples: number[] = [];
    for (let index = 0; index < 20; index += 1) {
      const started = performance.now();
      const preview = await service.preview(planYaml);
      samples.push(performance.now() - started);
      expect(preview.changes.filter((change) => change.entityType === "TASK")).toEqual([]);
    }
    expect(Object.keys(state.records.quarters)).toHaveLength(8);
    expect(Object.keys(state.records.tasks)).toHaveLength(1_000);
    expect(Object.keys(state.records.sessions)).toHaveLength(2_000);
    expect(Object.keys(state.records.journeyEntries)).toHaveLength(2_000);
    expect(p95(samples)).toBeLessThan(200);
  });
});
