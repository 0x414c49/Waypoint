import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateJourneyState, type JourneyState } from "./journey-state.js";
import { parseAndNormalizePlanYaml } from "./plan.js";

const fixturePath = resolve(process.cwd(), "planning/fixtures/q4-2026-engineering-growth.yaml");

export function createProductionSeed(writtenAt: string): JourneyState {
  const plan = parseAndNormalizePlanYaml(readFileSync(fixturePath, "utf8"));
  const quarterId = plan.quarter.id;
  const state: JourneyState = {
    schemaVersion: 1,
    storeRevision: 0,
    writtenAt,
    records: {
      users: {
        "local-user": {
          id: "local-user",
          name: "Ali",
          timeZone: "Europe/Amsterdam",
          createdAt: writtenAt,
        },
      },
      quarters: {
        [quarterId]: {
          id: quarterId,
          userId: "local-user",
          title: plan.quarter.title,
          ...(plan.quarter.description ? { description: plan.quarter.description } : {}),
          ...(plan.quarter.mantra ? { mantra: plan.quarter.mantra } : {}),
          startDate: plan.quarter.start,
          endDate: plan.quarter.end,
          successCriteria: plan.quarter.successCriteria.map((criterion, position) => ({
            ...criterion,
            position,
          })),
          planRevision: 1,
          createdAt: writtenAt,
          updatedAt: writtenAt,
        },
      },
      focusAreas: Object.fromEntries(plan.focusAreas.map((area, position) => [area.id, {
        id: area.id,
        quarterId,
        name: area.name,
        ...(area.description ? { description: area.description } : {}),
        ...(area.targetMinutes ? { targetMinutes: area.targetMinutes } : {}),
        position,
        createdAt: writtenAt,
        updatedAt: writtenAt,
      }])),
      milestones: Object.fromEntries(plan.milestones.map((milestone, position) => [milestone.id, {
        id: milestone.id,
        quarterId,
        title: milestone.title,
        ...(milestone.description ? { description: milestone.description } : {}),
        startDate: milestone.start,
        endDate: milestone.end,
        mode: milestone.mode,
        position,
        createdAt: writtenAt,
        updatedAt: writtenAt,
      }])),
      tasks: Object.fromEntries(plan.tasks.map((task, position) => [task.id, {
        id: task.id,
        quarterId,
        ...(task.focusAreaId ? { focusAreaId: task.focusAreaId } : {}),
        milestoneId: task.milestoneId,
        plannedDate: task.date,
        title: task.title,
        ...(task.description ? { description: task.description } : {}),
        ...(task.plannedMinutes ? { plannedMinutes: task.plannedMinutes } : {}),
        tags: task.tags,
        position,
        recommendationMode: task.recommendationMode,
        ...(task.decisionPrompt ? { decisionPrompt: task.decisionPrompt } : {}),
        status: "NOT_STARTED" as const,
        createdAt: writtenAt,
        updatedAt: writtenAt,
      }])),
      sessions: {},
      taskLifecycleEvents: {},
      dailyReviews: {},
      journeyEntries: {},
      decisionRecords: {},
      decisionReviews: {},
      aiReviews: {},
    },
    commandReceipts: {},
  };
  const errors = validateJourneyState(state);
  if (errors.length > 0) throw new Error(`Production seed is invalid: ${errors.join("; ")}`);
  return state;
}
