import type { JourneyState, TaskLifecycleEventRecord, TaskRecord } from "../../domain/journey-state.js";
import { addLocalDays, closedSessionSegments, localDate, localDateStartInstant } from "../dashboard/temporal.js";
import { projectTask } from "../dashboard/task-projection.js";
import { notFound } from "../app-error.js";
import { projectJourneyEntry } from "./journey-projection.js";

function statusAtPeriodEnd(state: JourneyState, task: TaskRecord, endDate: string, timeZone: string): TaskRecord["status"] {
  const cutoff = localDateStartInstant(addLocalDays(endDate, 1), timeZone);
  const sessions = Object.values(state.records.sessions).filter((session) => session.taskId === task.id && Date.parse(session.startedAt) < cutoff);
  const events = Object.values(state.records.taskLifecycleEvents)
    .filter((event) => event.taskId === task.id && Date.parse(event.occurredAt) < cutoff)
    .sort((a, b) => a.sequence - b.sequence);
  let closure: TaskLifecycleEventRecord | undefined;
  for (const event of events) {
    if (event.type === "FINISHED" || event.type === "SKIPPED") closure = event;
    else if (event.type === "REOPENED" && event.undoesEventId === closure?.id) closure = undefined;
  }
  const activeAtEnd = sessions.some((session) => !session.endedAt || Date.parse(session.endedAt) > cutoff);
  if (activeAtEnd && !closure) return "IN_PROGRESS";
  if (closure?.type === "FINISHED") return "FINISHED";
  if (closure?.type === "SKIPPED") return "SKIPPED";
  return sessions.length ? "PAUSED" : "NOT_STARTED";
}

function taskBelongsToMilestone(task: TaskRecord, milestoneId: string): boolean {
  return (task.planSnapshot?.milestoneId ?? task.milestoneId) === milestoneId;
}

export function projectMilestoneSummary(state: JourneyState, userId: string, milestoneId: string, generatedAt: string) {
  const milestone = state.records.milestones[milestoneId];
  const quarter = milestone ? state.records.quarters[milestone.quarterId] : undefined;
  if (!milestone || !quarter || quarter.userId !== userId) throw notFound();
  const snapshot = milestone.intentSnapshot;
  const startDate = snapshot?.startDate ?? milestone.startDate;
  const endDate = snapshot?.endDate ?? milestone.endDate;
  const timeZone = snapshot?.timeZoneAtCapture ?? state.records.users[userId]!.timeZone;
  const tasks = Object.values(state.records.tasks)
    .filter((task) => task.quarterId === quarter.id && taskBelongsToMilestone(task, milestone.id))
    .sort((a, b) => (a.planSnapshot?.plannedDate ?? a.plannedDate).localeCompare(b.planSnapshot?.plannedDate ?? b.plannedDate) || a.position - b.position);
  const taskRows = tasks.map((task) => {
    const projection = projectTask(state, task, generatedAt);
    return { task: projection, statusAtPeriodEnd: statusAtPeriodEnd(state, task, endDate, timeZone), currentStatus: task.status, actualSecondsAllTime: projection.timing.actualSecondsAtGeneratedAt };
  });
  const userSessions = Object.values(state.records.sessions).filter((session) => {
    const task = state.records.tasks[session.taskId];
    return task && state.records.quarters[task.quarterId]?.userId === userId;
  });
  let sessionSeconds = 0;
  let sessionCount = 0;
  for (const session of userSessions) {
    const segments = closedSessionSegments(session).filter((segment) => segment.date >= startDate && segment.date <= endDate);
    if (segments.length) sessionCount += 1;
    sessionSeconds += segments.reduce((sum, segment) => sum + segment.seconds, 0);
  }
  const periodEvents = Object.values(state.records.taskLifecycleEvents).filter((event) => {
    const task = state.records.tasks[event.taskId];
    const eventDate = localDate(event.occurredAt, event.timeZoneAtOccurrence);
    return task && state.records.quarters[task.quarterId]?.userId === userId && eventDate >= startDate && eventDate <= endDate;
  });
  const periodFinishes = periodEvents.filter((event) => event.type === "FINISHED");
  const periodReviews = periodFinishes.map((event) => Object.values(state.records.dailyReviews).find((review) => review.finishEventId === event.id)!).filter(Boolean);
  const thoughts = Object.values(state.records.journeyEntries)
    .filter((entry) => entry.userId === userId && localDate(entry.occurredAt, entry.timeZoneAtOccurrence) >= startDate && localDate(entry.occurredAt, entry.timeZoneAtOccurrence) <= endDate)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const substantiveDecisionReviews = Object.values(state.records.decisionReviews).filter((review) => {
    const decision = state.records.decisionRecords[review.decisionId];
    const reviewDate = localDate(review.reviewedAt, review.timeZoneAtReview);
    return decision?.userId === userId && review.outcome !== "DEFERRED" && reviewDate >= startDate && reviewDate <= endDate;
  });
  const reflectionEntry = Object.values(state.records.journeyEntries)
    .filter((entry) => entry.userId === userId && entry.relatedMilestoneId === milestone.id && !entry.relatedTaskId)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
  return {
    dataRevision: state.storeRevision,
    milestone: { id: milestone.id, quarterId: quarter.id, title: snapshot?.title ?? milestone.title, startDate, endDate, mode: snapshot?.mode ?? milestone.mode, displaySource: snapshot ? "HISTORICAL" as const : "CURRENT" as const },
    counts: {
      planned: tasks.length,
      touched: taskRows.filter((row) => row.task.timing.firstStartedAt !== null).length,
      finished: taskRows.filter((row) => row.currentStatus === "FINISHED").length,
      skipped: taskRows.filter((row) => row.currentStatus === "SKIPPED").length,
      open: taskRows.filter((row) => row.currentStatus === "IN_PROGRESS" || row.currentStatus === "PAUSED").length,
    },
    effortDuringPeriod: { sessionSeconds, sessionCount },
    eventsDuringPeriod: {
      finished: periodFinishes.length,
      skipped: periodEvents.filter((event) => event.type === "SKIPPED").length,
      reopened: periodEvents.filter((event) => event.type === "REOPENED").length,
      carriedForward: periodEvents.filter((event) => event.type === "CARRIED_FORWARD").length,
      decisionsReviewed: substantiveDecisionReviews.length,
      thoughtsCaptured: thoughts.length,
    },
    outcomes: {
      achieved: periodReviews.filter((review) => review.outcome === "ACHIEVED").length,
      partial: periodReviews.filter((review) => review.outcome === "PARTIAL").length,
      notAchieved: periodReviews.filter((review) => review.outcome === "NOT_ACHIEVED").length,
    },
    taskRows,
    thoughts: thoughts.map((entry) => projectJourneyEntry(state, entry)),
    changedMyMindCount: thoughts.filter((entry) => entry.changedMyMind).length,
    openWork: taskRows.filter((row) => row.currentStatus === "IN_PROGRESS" || row.currentStatus === "PAUSED").map((row) => row.task),
    reflection: { prompt: "What changed in how you think about this work?", entry: reflectionEntry ? projectJourneyEntry(state, reflectionEntry) : null },
  };
}
