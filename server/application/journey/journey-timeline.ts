import type { JourneyState } from "../../domain/journey-state.js";
import { effectiveSessionSeconds, isCalendarDate, localDate } from "../dashboard/temporal.js";
import { AppError } from "../app-error.js";
import { decodeTimelineCursor, encodeTimelineCursor } from "./pagination.js";
import { projectJourneyEntry } from "./journey-projection.js";

export interface JourneyFilters {
  from?: string; to?: string; taskId?: string; milestoneId?: string;
  changedMyMind?: boolean; type?: "THOUGHT" | "SESSION" | "TASK_FINISHED" | "WEEKLY_REFLECTION" | "DECISION_REVIEW";
  cursor?: string; limit: number;
}

type TimelineItem = ReturnType<typeof projectJourneyEntry> | {
  id: string; type: "SESSION"; occurredAt: string; endedAt: string; seconds: number;
  task: { id: string; title: string };
} | {
  id: string; type: "TASK_FINISHED"; occurredAt: string; task: { id: string; title: string };
  outcome: "ACHIEVED" | "PARTIAL" | "NOT_ACHIEVED"; keyLearning: string | null;
} | {
  id: string; type: "DECISION_REVIEW"; occurredAt: string; localDate: string;
  decision: { id: string; title: string };
  outcome: "HOLDS" | "ADJUST" | "SUPERSEDE" | "DEFERRED";
  notes: string | null; nextReviewDate: string | null; substantive: boolean;
};

type OrderedTimelineItem = TimelineItem & { orderKey: string };

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
  const items: OrderedTimelineItem[] = [];
  for (const entry of Object.values(state.records.journeyEntries)) {
    if (entry.userId !== userId) continue;
    const projection = projectJourneyEntry(state, entry);
    if (filters.taskId && entry.relatedTaskId !== filters.taskId) continue;
    if (filters.milestoneId && entry.relatedMilestoneId !== filters.milestoneId && (!entry.relatedTaskId || taskMilestoneId(state, entry.relatedTaskId) !== filters.milestoneId)) continue;
    if (filters.changedMyMind !== undefined && entry.changedMyMind !== filters.changedMyMind) continue;
    if (filters.type && projection.type !== filters.type) continue;
    if (filters.from && projection.localDate < filters.from) continue;
    if (filters.to && projection.localDate > filters.to) continue;
    items.push({ ...projection, orderKey: `item:${projection.id}` });
  }
  if (filters.changedMyMind === undefined) {
    for (const session of Object.values(state.records.sessions)) {
      if (!session.endedAt || !belongs(session.taskId)) continue;
      if (filters.taskId && session.taskId !== filters.taskId) continue;
      if (filters.milestoneId && taskMilestoneId(state, session.taskId) !== filters.milestoneId) continue;
      if (filters.type && filters.type !== "SESSION") continue;
      const date = localDate(session.startedAt, session.timeZoneAtStart);
      if (filters.from && date < filters.from || filters.to && date > filters.to) continue;
      items.push({ id: session.id, type: "SESSION", occurredAt: session.startedAt, endedAt: session.endedAt, seconds: effectiveSessionSeconds(session, session.endedAt), task: { id: session.taskId, title: taskTitle(state, session.taskId) }, orderKey: `item:${session.id}` });
    }
    for (const event of Object.values(state.records.taskLifecycleEvents)) {
      if (event.type !== "FINISHED" || !belongs(event.taskId)) continue;
      if (filters.taskId && event.taskId !== filters.taskId) continue;
      if (filters.milestoneId && taskMilestoneId(state, event.taskId) !== filters.milestoneId) continue;
      if (filters.type && filters.type !== "TASK_FINISHED") continue;
      const date = localDate(event.occurredAt, event.timeZoneAtOccurrence);
      if (filters.from && date < filters.from || filters.to && date > filters.to) continue;
      const review = Object.values(state.records.dailyReviews).find((candidate) => candidate.finishEventId === event.id)!;
      items.push({ id: event.id, type: "TASK_FINISHED", occurredAt: event.occurredAt, task: { id: event.taskId, title: taskTitle(state, event.taskId) }, outcome: review.outcome, keyLearning: review.keyLearning ?? null, orderKey: `item:${event.id}` });
    }
    for (const review of Object.values(state.records.decisionReviews)) {
      const decision = state.records.decisionRecords[review.decisionId];
      if (!decision || decision.userId !== userId) continue;
      if (filters.taskId && decision.relatedTaskId !== filters.taskId) continue;
      if (filters.milestoneId && (!decision.relatedTaskId || taskMilestoneId(state, decision.relatedTaskId) !== filters.milestoneId)) continue;
      if (filters.type && filters.type !== "DECISION_REVIEW") continue;
      const date = localDate(review.reviewedAt, review.timeZoneAtReview);
      if (filters.from && date < filters.from || filters.to && date > filters.to) continue;
      items.push({ id: review.id, type: "DECISION_REVIEW", occurredAt: review.reviewedAt, localDate: date, decision: { id: decision.id, title: decision.title }, outcome: review.outcome, notes: review.notes ?? null, nextReviewDate: review.nextReviewDate ?? null, substantive: review.outcome !== "DEFERRED", orderKey: `review:${decision.id}:${String(review.sequence).padStart(10, "0")}:${review.id}` });
    }
  }
  items.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || right.orderKey.localeCompare(left.orderKey));
  const cursor = decodeTimelineCursor(filters.cursor);
  const cursorOrderKey = cursor?.orderKey ?? cursor?.id;
  const remaining = cursor
    ? items.filter((item) => item.occurredAt < cursor.occurredAt || item.occurredAt === cursor.occurredAt && item.orderKey < cursorOrderKey!)
    : items;
  const page = remaining.slice(0, filters.limit);
  const last = page.at(-1);
  return {
    items: page.map(({ orderKey, ...item }) => {
      void orderKey;
      return item;
    }),
    nextCursor: last && page.length < remaining.length
      ? encodeTimelineCursor({ occurredAt: last.occurredAt, id: last.id, orderKey: last.orderKey })
      : null,
  };
}
