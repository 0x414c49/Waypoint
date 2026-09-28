import type { FocusAreaRecord, JourneyState, MilestoneRecord, TaskRecord } from "../../domain/journey-state.js";
import { taskEtag } from "../task-etag.js";
import type { PlanProjection, TaskProjection } from "./dashboard-types.js";
import { effectiveSessionSeconds } from "./temporal.js";

function planFor(task: TaskRecord, focusArea: FocusAreaRecord | undefined, milestone: MilestoneRecord | undefined): PlanProjection {
  return {
    ...(focusArea ? { focusArea: { id: focusArea.id, name: focusArea.name } } : {}),
    ...(milestone ? { milestone: { id: milestone.id, title: milestone.title } } : {}),
    plannedDate: task.plannedDate,
    title: task.title,
    ...(task.description ? { description: task.description } : {}),
    ...(task.plannedMinutes ? { plannedMinutes: task.plannedMinutes } : {}),
    tags: [...task.tags],
    recommendationMode: task.recommendationMode,
    ...(task.removedFromPlanAt ? { removedFromPlanAt: task.removedFromPlanAt } : {}),
  };
}

export function projectTask(state: JourneyState, task: TaskRecord, generatedAt: string): TaskProjection {
  const sessions = Object.values(state.records.sessions).filter((session) => session.taskId === task.id).sort((left, right) => left.startedAt.localeCompare(right.startedAt));
  const active = sessions.find((session) => !session.endedAt);
  const current = planFor(task, task.focusAreaId ? state.records.focusAreas[task.focusAreaId] : undefined, task.milestoneId ? state.records.milestones[task.milestoneId] : undefined);
  const snapshot = task.planSnapshot;
  const historical = snapshot ? {
    ...(snapshot.focusAreaId && snapshot.focusAreaName ? { focusArea: { id: snapshot.focusAreaId, name: snapshot.focusAreaName } } : {}),
    ...(snapshot.milestoneId && snapshot.milestoneTitle ? { milestone: { id: snapshot.milestoneId, title: snapshot.milestoneTitle } } : {}),
    plannedDate: snapshot.plannedDate,
    title: snapshot.title,
    ...(snapshot.description ? { description: snapshot.description } : {}),
    ...(snapshot.plannedMinutes ? { plannedMinutes: snapshot.plannedMinutes } : {}),
    tags: [...snapshot.tags],
    recommendationMode: snapshot.recommendationMode,
    capturedAt: snapshot.capturedAt,
    planRevision: snapshot.planRevision,
  } : undefined;
  const displayPlan: PlanProjection = historical
    ? {
        ...(historical.focusArea ? { focusArea: historical.focusArea } : {}),
        ...(historical.milestone ? { milestone: historical.milestone } : {}),
        plannedDate: historical.plannedDate,
        title: historical.title,
        ...(historical.description ? { description: historical.description } : {}),
        ...(historical.plannedMinutes ? { plannedMinutes: historical.plannedMinutes } : {}),
        tags: [...historical.tags],
        recommendationMode: historical.recommendationMode,
      }
    : current;
  return {
    id: task.id,
    etag: taskEtag(state, task),
    status: task.status,
    currentPlan: current,
    ...(historical ? { historicalPlan: historical } : {}),
    displayPlanSource: historical ? "HISTORICAL" : "CURRENT",
    displayPlan,
    timing: {
      actualSecondsAtGeneratedAt: sessions.reduce((total, session) => total + effectiveSessionSeconds(session, generatedAt), 0),
      firstStartedAt: sessions[0]?.startedAt ?? null,
      runningSince: active?.startedAt ?? null,
    },
    availableActions: task.status === "NOT_STARTED" ? ["START", "DO_TEN_MINUTES"] : task.status === "IN_PROGRESS" ? ["PAUSE", "FINISH", "CARRY_FORWARD"] : task.status === "PAUSED" ? ["RESUME", "FINISH", "CARRY_FORWARD"] : ["REOPEN"],
  };
}
