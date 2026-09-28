import type { JourneyState, TaskRecord } from "../../domain/journey-state.js";
import { projectTask } from "../dashboard/task-projection.js";
import { decodeOffsetCursor, encodeOffsetCursor } from "./pagination.js";
import { isCalendarDate } from "../dashboard/temporal.js";
import { AppError } from "../app-error.js";

export interface TaskListFilters {
  quarterId?: string; milestoneId?: string; focusAreaId?: string; plannedFrom?: string; plannedTo?: string;
  status?: TaskRecord["status"]; includeRemoved?: boolean; cursor?: string; limit: number;
}

export function projectTaskList(state: JourneyState, userId: string, filters: TaskListFilters, generatedAt: string) {
  if (filters.plannedFrom && !isCalendarDate(filters.plannedFrom) || filters.plannedTo && !isCalendarDate(filters.plannedTo) || filters.plannedFrom && filters.plannedTo && filters.plannedFrom > filters.plannedTo) {
    throw new AppError(422, "VALIDATION_FAILED", "The date range is not valid", "Use real calendar dates and keep the end on or after the start.");
  }
  const tasks = Object.values(state.records.tasks).filter((task) => {
    if (state.records.quarters[task.quarterId]?.userId !== userId) return false;
    if (!filters.includeRemoved && task.removedFromPlanAt) return false;
    if (filters.quarterId && task.quarterId !== filters.quarterId) return false;
    if (filters.milestoneId && task.milestoneId !== filters.milestoneId && task.planSnapshot?.milestoneId !== filters.milestoneId) return false;
    if (filters.focusAreaId && task.focusAreaId !== filters.focusAreaId && task.planSnapshot?.focusAreaId !== filters.focusAreaId) return false;
    if (filters.plannedFrom && task.plannedDate < filters.plannedFrom) return false;
    if (filters.plannedTo && task.plannedDate > filters.plannedTo) return false;
    return !filters.status || task.status === filters.status;
  }).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate) || a.position - b.position || a.id.localeCompare(b.id));
  const offset = decodeOffsetCursor(filters.cursor);
  return {
    items: tasks.slice(offset, offset + filters.limit).map((task) => projectTask(state, task, generatedAt)),
    nextCursor: offset + filters.limit < tasks.length ? encodeOffsetCursor(offset + filters.limit) : null,
  };
}
