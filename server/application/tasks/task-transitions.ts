import type { JourneyState, TaskLifecycleEventRecord, TaskRecord } from "../../domain/journey-state.js";
import type { IdGenerator } from "../../ports/id-generator.js";
import { AppError, notFound } from "../app-error.js";
import { taskEtag } from "../task-etag.js";
import type { ActiveSessionResolution, CommandOutcome, TaskCommandRequest } from "./task-command-types.js";
import { captureTaskPlanContext } from "../history/capture-plan-context.js";

export function assertTaskOwner(state: JourneyState, taskId: string, userId: string): TaskRecord {
  const task = state.records.tasks[taskId];
  if (!task || state.records.quarters[task.quarterId]?.userId !== userId) throw notFound();
  return task;
}

export function currentActiveSession(state: JourneyState) {
  return Object.values(state.records.sessions).find((session) => !session.endedAt);
}

function invalidTransition(task: TaskRecord): never {
  throw new AppError(409, "INVALID_TASK_TRANSITION", "That action is not available", "Refresh the item to see its current actions.", {
    current: { taskId: task.id, status: task.status },
  });
}

function endSession(state: JourneyState, sessionId: string, occurredAt: string): TaskRecord {
  const session = state.records.sessions[sessionId]!;
  session.endedAt = occurredAt;
  session.updatedAt = occurredAt;
  const task = state.records.tasks[session.taskId]!;
  task.status = "PAUSED";
  task.updatedAt = occurredAt;
  return task;
}

function createSession(state: JourneyState, task: TaskRecord, id: string, occurredAt: string, timeZone: string, intentionMinutes?: 10): string {
  state.records.sessions[id] = {
    id,
    taskId: task.id,
    startedAt: occurredAt,
    timeZoneAtStart: timeZone,
    ...(intentionMinutes ? { intentionMinutes } : {}),
    createdAt: occurredAt,
    updatedAt: occurredAt,
  };
  task.status = "IN_PROGRESS";
  task.updatedAt = occurredAt;
  return id;
}

function appendEvent(state: JourneyState, task: TaskRecord, id: string, type: TaskLifecycleEventRecord["type"], occurredAt: string, timeZone: string, relation: Pick<TaskLifecycleEventRecord, "undoesEventId" | "relatedTaskId"> = {}): TaskLifecycleEventRecord {
  const sequence = Math.max(0, ...Object.values(state.records.taskLifecycleEvents).filter((event) => event.taskId === task.id).map((event) => event.sequence)) + 1;
  const event: TaskLifecycleEventRecord = { id, taskId: task.id, sequence, type, occurredAt, timeZoneAtOccurrence: timeZone, ...relation, createdAt: occurredAt };
  state.records.taskLifecycleEvents[id] = event;
  return event;
}

function pauseAndSwitch(state: JourneyState, target: TaskRecord, resolution: ActiveSessionResolution | undefined, occurredAt: string): string[] {
  const active = currentActiveSession(state);
  if (!active || active.taskId === target.id) return [];
  const currentTask = state.records.tasks[active.taskId]!;
  const currentEtag = taskEtag(state, currentTask);
  if (!resolution || resolution.activeSessionId !== active.id || resolution.activeTaskEtag !== currentEtag) {
    throw new AppError(409, "ACTIVE_SESSION_CONFLICT", "Another session is running", "Pause the current session before starting this item.", {
      current: { activeSession: { id: active.id, startedAt: active.startedAt, task: { id: currentTask.id, title: currentTask.title, etag: currentEtag } } },
      attempted: { taskId: target.id },
      resolutions: [
        { kind: "PAUSE_AND_SWITCH", method: "POST", body: { activeSessionResolution: { kind: "PAUSE_AND_SWITCH", activeSessionId: active.id, activeTaskEtag: currentEtag } } },
        { kind: "CANCEL" },
      ],
    });
  }
  endSession(state, active.id, occurredAt);
  return [currentTask.id];
}

export function applyTaskTransition(
  state: JourneyState,
  task: TaskRecord,
  request: TaskCommandRequest,
  ids: IdGenerator,
  now: Date,
  timeZone: string,
): CommandOutcome {
  const occurredAt = now.toISOString();
  const affectedTaskIds: string[] = [];
  const outcome: CommandOutcome = { taskId: task.id, affectedTaskIds };
  if (request.action === "start" || request.action === "resume") {
    const expected = request.action === "start" ? "NOT_STARTED" : "PAUSED";
    if (!(task.status === "IN_PROGRESS" && currentActiveSession(state)?.taskId === task.id)) {
      if (task.status !== expected) invalidTransition(task);
      affectedTaskIds.push(...pauseAndSwitch(state, task, request.body.activeSessionResolution, occurredAt));
      captureTaskPlanContext(state, task, timeZone, occurredAt);
      outcome.sessionId = createSession(state, task, ids.generate(), occurredAt, timeZone, request.action === "start" ? request.body.intentionMinutes : undefined);
    }
  } else if (request.action === "pause") {
    if (task.status !== "PAUSED") {
      if (task.status !== "IN_PROGRESS") invalidTransition(task);
      const active = currentActiveSession(state);
      if (!active || active.taskId !== task.id) invalidTransition(task);
      endSession(state, active.id, occurredAt);
    }
  } else if (request.action === "finish") {
    if (task.status !== "IN_PROGRESS" && task.status !== "PAUSED") invalidTransition(task);
    if (!request.body.outcome) {
      throw new AppError(422, "VALIDATION_FAILED", "The request is not valid", "Choose how the session landed.", {
        fieldErrors: [{ path: "/outcome", code: "REQUIRED", message: "Choose Achieved, Made progress, or Not achieved." }],
      });
    }
    const active = currentActiveSession(state);
    if (active?.taskId === task.id) endSession(state, active.id, occurredAt);
    const finishEvent = appendEvent(state, task, ids.generate(), "FINISHED", occurredAt, timeZone);
    const reviewId = ids.generate();
    state.records.dailyReviews[reviewId] = {
      id: reviewId, taskId: task.id, finishEventId: finishEvent.id, outcome: request.body.outcome,
      ...(request.body.keyLearning ? { keyLearning: request.body.keyLearning } : {}),
      ...(request.body.reflection ? { reflection: request.body.reflection } : {}),
      createdAt: occurredAt, updatedAt: occurredAt,
    };
    task.status = "FINISHED";
    task.updatedAt = occurredAt;
    Object.assign(outcome, { finishEventId: finishEvent.id, reviewId, outcome: request.body.outcome, undoUntil: new Date(now.valueOf() + 5 * 60 * 1000).toISOString() });
  } else {
    if (task.status !== "FINISHED" && task.status !== "SKIPPED") invalidTransition(task);
    const openContinuation = Object.values(state.records.tasks).find((candidate) =>
      candidate.continuationOfTaskId === task.id && candidate.status !== "FINISHED" && candidate.status !== "SKIPPED",
    );
    if (openContinuation) {
      throw new AppError(409, "OPEN_CONTINUATION_EXISTS", "This work already continues elsewhere", "Open the continuation instead of reopening its source.", {
        current: { continuation: { id: openContinuation.id, status: openContinuation.status } },
      });
    }
    const closure = state.records.taskLifecycleEvents[request.body.closureEventId ?? ""];
    const latest = Object.values(state.records.taskLifecycleEvents)
      .filter((event) => event.taskId === task.id && (event.type === "FINISHED" || event.type === "SKIPPED") && !Object.values(state.records.taskLifecycleEvents).some((later) => later.type === "REOPENED" && later.undoesEventId === event.id))
      .sort((left, right) => right.sequence - left.sequence)[0];
    if (!closure || closure.id !== latest?.id) invalidTransition(task);
    const reopened = appendEvent(state, task, ids.generate(), "REOPENED", occurredAt, timeZone, { undoesEventId: closure.id });
    task.status = Object.values(state.records.sessions).some((session) => session.taskId === task.id) ? "PAUSED" : "NOT_STARTED";
    task.updatedAt = occurredAt;
    outcome.closureEventId = closure.id;
    outcome.reopenedEventId = reopened.id;
  }
  if (!affectedTaskIds.includes(task.id)) affectedTaskIds.push(task.id);
  return outcome;
}
