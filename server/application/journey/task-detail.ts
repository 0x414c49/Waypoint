import type { JourneyState } from "../../domain/journey-state.js";
import { notFound } from "../app-error.js";
import { projectTask } from "../dashboard/task-projection.js";
import { projectJourneyEntry } from "./journey-projection.js";
import { projectSession } from "./session-projection.js";

export function projectTaskDetail(state: JourneyState, userId: string, taskId: string, generatedAt: string) {
  const task = state.records.tasks[taskId];
  if (!task || state.records.quarters[task.quarterId]?.userId !== userId) throw notFound();
  const sessions = Object.values(state.records.sessions).filter((item) => item.taskId === task.id).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const lifecycle = Object.values(state.records.taskLifecycleEvents).filter((item) => item.taskId === task.id).sort((a, b) => a.sequence - b.sequence);
  const reviews = Object.values(state.records.dailyReviews).filter((item) => item.taskId === task.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const thoughts = Object.values(state.records.journeyEntries).filter((item) => item.relatedTaskId === task.id).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return {
    task: projectTask(state, task, generatedAt),
    quarterId: task.quarterId,
    sessionsHref: `/api/tasks/${task.id}/sessions`,
    sessions: sessions.map((session) => projectSession(session, generatedAt)),
    reviews: reviews.map((review) => ({ id: review.id, finishEventId: review.finishEventId, outcome: review.outcome, keyLearning: review.keyLearning ?? null, reflection: review.reflection ?? null, createdAt: review.createdAt })),
    thoughts: thoughts.map((entry) => projectJourneyEntry(state, entry)),
    lifecycle: lifecycle.map((event) => ({ id: event.id, sequence: event.sequence, type: event.type, occurredAt: event.occurredAt, relatedTaskId: event.relatedTaskId ?? null, undoesEventId: event.undoesEventId ?? null })),
  };
}
