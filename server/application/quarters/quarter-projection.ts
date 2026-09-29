import type { JourneyState, QuarterRecord } from "../../domain/journey-state.js";
import type { QuarterDetailContract, QuarterListContract } from "../../../shared/contracts/quarters.js";
import { AppError } from "../app-error.js";
import { localDate } from "../dashboard/temporal.js";
import { opaqueHash } from "../task-etag.js";

export function quarterEtag(quarter: QuarterRecord): string {
  return `"quarter-${opaqueHash([quarter.id, quarter.planRevision])}"`;
}

function phaseOf(quarter: QuarterRecord, today: string): "CURRENT" | "FUTURE" | "PAST" {
  if (today < quarter.startDate) return "FUTURE";
  if (today > quarter.endDate) return "PAST";
  return "CURRENT";
}

export function projectQuarterList(state: JourneyState, userId: string, now: Date): QuarterListContract {
  const user = state.records.users[userId];
  if (!user) throw new AppError(404, "RESOURCE_NOT_FOUND", "Resource not found", "That local resource does not exist.");
  const today = localDate(now, user.timeZone);
  const phaseOrder = { CURRENT: 0, FUTURE: 1, PAST: 2 } as const;
  return {
    items: Object.values(state.records.quarters)
      .filter((quarter) => quarter.userId === userId)
      .map((quarter) => ({
        id: quarter.id,
        title: quarter.title,
        startDate: quarter.startDate,
        endDate: quarter.endDate,
        phase: phaseOf(quarter, today),
        planRevision: quarter.planRevision,
        etag: quarterEtag(quarter),
      }))
      .sort((left, right) => phaseOrder[left.phase] - phaseOrder[right.phase] || left.startDate.localeCompare(right.startDate)),
  };
}

export function projectQuarterDetail(state: JourneyState, userId: string, quarterId: string, now: Date): QuarterDetailContract {
  const quarter = state.records.quarters[quarterId];
  const user = state.records.users[userId];
  if (!quarter || quarter.userId !== userId || !user) {
    throw new AppError(404, "RESOURCE_NOT_FOUND", "Resource not found", "That local resource does not exist.");
  }
  const focusAreas = Object.values(state.records.focusAreas)
    .filter((area) => area.quarterId === quarterId && !area.removedFromPlanAt)
    .sort((left, right) => left.position - right.position);
  const milestones = Object.values(state.records.milestones)
    .filter((milestone) => milestone.quarterId === quarterId && !milestone.removedFromPlanAt)
    .sort((left, right) => left.position - right.position);
  const tasks = Object.values(state.records.tasks)
    .filter((task) => task.quarterId === quarterId && !task.removedFromPlanAt)
    .sort((left, right) => left.plannedDate.localeCompare(right.plannedDate) || left.position - right.position);
  const today = localDate(now, user.timeZone);
  return {
    id: quarter.id,
    title: quarter.title,
    ...(quarter.description ? { description: quarter.description } : {}),
    ...(quarter.mantra ? { mantra: quarter.mantra } : {}),
    startDate: quarter.startDate,
    endDate: quarter.endDate,
    phase: phaseOf(quarter, today),
    planRevision: quarter.planRevision,
    etag: quarterEtag(quarter),
    successCriteria: [...quarter.successCriteria].sort((left, right) => left.position - right.position),
    focusAreas: focusAreas.map(({ id, name, description, targetMinutes, position }) => ({
      id, name, ...(description ? { description } : {}), ...(targetMinutes ? { targetMinutes } : {}), position,
    })),
    milestones: milestones.map((milestone) => ({
      id: milestone.id,
      title: milestone.title,
      ...(milestone.description ? { description: milestone.description } : {}),
      startDate: milestone.startDate,
      endDate: milestone.endDate,
      mode: milestone.mode,
      position: milestone.position,
      taskCount: tasks.filter((task) => task.milestoneId === milestone.id).length,
    })),
    tasks: tasks.map((task) => ({
      id: task.id,
      title: task.title,
      plannedDate: task.plannedDate,
      ...(task.focusAreaId ? { focusAreaId: task.focusAreaId } : {}),
      milestoneId: task.milestoneId!,
      recommendationMode: task.recommendationMode,
    })),
  };
}
