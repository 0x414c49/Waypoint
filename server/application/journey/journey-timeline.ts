import type { JourneyState } from "../../domain/journey-state.js";
import { effectiveSessionSeconds, isCalendarDate, localDate } from "../dashboard/temporal.js";
import { AppError } from "../app-error.js";
import { decodeTimelineCursor, encodeTimelineCursor } from "./pagination.js";
import { projectJourneyEntry } from "./journey-projection.js";

export interface JourneyFilters {
  from?: string; to?: string; taskId?: string; milestoneId?: string;
  changedMyMind?: boolean; type?: "THOUGHT" | "SESSION" | "TASK_FINISHED" | "WEEKLY_REFLECTION";
  cursor?: string; limit: number;
}

type TimelineItem = ReturnType<typeof projectJourneyEntry> | {
  id: string; type: "SESSION"; occurredAt: string; endedAt: string; seconds: number;
  task: { id: string; title: string };
} | {
  id: string; type: "TASK_FINISHED"; occurredAt: string; task: { id: string; title: string };
  outcome: "ACHIEVED" | "PARTIAL" | "NOT_ACHIEVED"; keyLearning: string | null;
};

function taskMilestoneId(state: JourneyState, taskId: string): string | undefined {
  const task = state.records.tasks[taskId];
  return task?.planSnapshot?.milestoneId ?? task?.milestoneId;
}

function taskTitle(state: JourneyState, taskId: string): string {
  const task = state.records.tasks[taskId]!;
  return task.planSnapshot?.title ?? task.title;
}

export function projectJourneyTimeline(state: JourneyState, userId: string, filters: JourneyFilters) {
  if (filters.from && !isCalendarDate(filters.from) || filters.to && !isCalendarDate(filters.to) || filters.from && filters.to && filters.from > filters.to) {
    throw new AppError(422, "VALIDATION_FAILED", "The date range is not valid", "Use real calendar dates and keep the end on or after the start.");
  }
  const belongs = (taskId: string) => state.records.quarters[state.records.tasks[taskId]?.quarterId ?? ""]?.userId === userId;
  const items: TimelineItem[] = [];
  for (const entry of Object.values(state.records.journeyEntries)) {
    if (entry.userId !== userId) continue;
    const projection = projectJourneyEntry(state, entry);
    if (filters.taskId && entry.relatedTaskId !== filters.taskId) continue;
    if (filters.milestoneId && entry.relatedMilestoneId !== filters.milestoneId && (!entry.relatedTaskId || taskMilestoneId(state, entry.relatedTaskId) !== filters.milestoneId)) continue;
    if (filters.changedMyMind !== undefined && entry.changedMyMind !== filters.changedMyMind) continue;
    if (filters.type && projection.type !== filters.type) continue;
    if (filters.from && projection.localDate < filters.from) continue;
    if (filters.to && projection.localDate > filters.to) continue;
    items.push(projection);
  }
  if (filters.changedMyMind === undefined) {
    for (const session of Object.values(state.records.sessions)) {
      if (!session.endedAt || !belongs(session.taskId)) continue;
      if (filters.taskId && session.taskId !== filters.taskId) continue;
      if (filters.milestoneId && taskMilestoneId(state, session.taskId) !== filters.milestoneId) continue;
      if (filters.type && filters.type !== "SESSION") continue;
      const date = localDate(session.startedAt, session.timeZoneAtStart);
      if (filters.from && date < filters.from || filters.to && date > filters.to) continue;
      items.push({ id: session.id, type: "SESSION", occurredAt: session.startedAt, endedAt: session.endedAt, seconds: effectiveSessionSeconds(session, session.endedAt), task: { id: session.taskId, title: taskTitle(state, session.taskId) } });
    }
    for (const event of Object.values(state.records.taskLifecycleEvents)) {
      if (event.type !== "FINISHED" || !belongs(event.taskId)) continue;
      if (filters.taskId && event.taskId !== filters.taskId) continue;
      if (filters.milestoneId && taskMilestoneId(state, event.taskId) !== filters.milestoneId) continue;
      if (filters.type && filters.type !== "TASK_FINISHED") continue;
      const date = localDate(event.occurredAt, event.timeZoneAtOccurrence);
      if (filters.from && date < filters.from || filters.to && date > filters.to) continue;
      const review = Object.values(state.records.dailyReviews).find((candidate) => candidate.finishEventId === event.id)!;
      items.push({ id: event.id, type: "TASK_FINISHED", occurredAt: event.occurredAt, task: { id: event.taskId, title: taskTitle(state, event.taskId) }, outcome: review.outcome, keyLearning: review.keyLearning ?? null });
    }
  }
  items.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || right.id.localeCompare(left.id));
  const cursor = decodeTimelineCursor(filters.cursor);
  const remaining = cursor
    ? items.filter((item) => item.occurredAt < cursor.occurredAt || item.occurredAt === cursor.occurredAt && item.id < cursor.id)
    : items;
  const page = remaining.slice(0, filters.limit);
  const last = page.at(-1);
  return {
    items: page,
    nextCursor: last && page.length < remaining.length
      ? encodeTimelineCursor({ occurredAt: last.occurredAt, id: last.id })
      : null,
  };
}
