import { Value } from "@sinclair/typebox/value";
import type { SessionRecord, TaskLifecycleEventRecord, TaskRecord } from "./journey-records.js";
import { JourneyStateSchema, type JourneyState } from "./journey-state-schema.js";

const collectionNames = [
  "users", "quarters", "focusAreas", "milestones", "tasks", "sessions",
  "taskLifecycleEvents", "dailyReviews", "journeyEntries", "decisionRecords",
  "decisionReviews", "aiReviews",
] as const;

function isUtcInstant(value: string): boolean {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function isIanaTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function instant(errors: string[], path: string, value: string): void {
  if (!isUtcInstant(value)) errors.push(`${path}: expected a normalized UTC instant`);
}

function date(errors: string[], path: string, value: string): void {
  if (!isCalendarDate(value)) errors.push(`${path}: expected a valid calendar date`);
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

interface Projection {
  readonly status: TaskRecord["status"];
  readonly errors: readonly string[];
}

export function projectTaskStatus(
  task: TaskRecord,
  sessions: readonly SessionRecord[],
  events: readonly TaskLifecycleEventRecord[],
): Projection {
  const projectionErrors: string[] = [];
  const ordered = [...events].sort((left, right) => left.sequence - right.sequence);
  let effectiveClosure: TaskLifecycleEventRecord | undefined;
  const reopened = new Set<string>();

  for (const event of ordered) {
    if (event.type === "FINISHED" || event.type === "SKIPPED") {
      if (effectiveClosure) {
        projectionErrors.push(`${event.id}: terminal event follows unreopened terminal event ${effectiveClosure.id}`);
      }
      effectiveClosure = event;
      continue;
    }
    if (event.type !== "REOPENED") continue;
    if (!event.undoesEventId || !effectiveClosure || event.undoesEventId !== effectiveClosure.id) {
      projectionErrors.push(`${event.id}: REOPENED must undo the latest effective terminal event`);
      continue;
    }
    if (reopened.has(event.undoesEventId)) {
      projectionErrors.push(`${event.id}: terminal event ${event.undoesEventId} was already reopened`);
      continue;
    }
    if (event.occurredAt <= effectiveClosure.occurredAt) {
      projectionErrors.push(`${event.id}: REOPENED must occur after the terminal event`);
    }
    reopened.add(event.undoesEventId);
    effectiveClosure = undefined;
  }

  const active = sessions.filter((session) => !session.endedAt);
  if (active.length > 0 && effectiveClosure) {
    projectionErrors.push(`active Session cannot coexist with terminal event ${effectiveClosure.id}`);
  }
  if (active.length === 1 && !effectiveClosure) return { status: "IN_PROGRESS", errors: projectionErrors };
  if (effectiveClosure?.type === "FINISHED") return { status: "FINISHED", errors: projectionErrors };
  if (effectiveClosure?.type === "SKIPPED") return { status: "SKIPPED", errors: projectionErrors };
  if (sessions.length > 0) return { status: "PAUSED", errors: projectionErrors };
  return { status: "NOT_STARTED", errors: projectionErrors };
}

function validateQuarterAndPlanRecords(state: JourneyState, errors: string[]): void {
  const quarters = Object.values(state.records.quarters);
  for (const quarter of quarters) {
    const path = `/records/quarters/${quarter.id}`;
    if (!state.records.users[quarter.userId]) errors.push(`${path}/userId: user does not exist`);
    date(errors, `${path}/startDate`, quarter.startDate);
    date(errors, `${path}/endDate`, quarter.endDate);
    if (quarter.startDate > quarter.endDate) errors.push(`${path}: startDate must precede endDate`);
    instant(errors, `${path}/createdAt`, quarter.createdAt);
    instant(errors, `${path}/updatedAt`, quarter.updatedAt);
    if (quarter.lastPlanImportedAt) instant(errors, `${path}/lastPlanImportedAt`, quarter.lastPlanImportedAt);
    const ids = new Set<string>();
    for (const criterion of quarter.successCriteria) {
      if (ids.has(criterion.id)) errors.push(`${path}/successCriteria: duplicate id ${criterion.id}`);
      ids.add(criterion.id);
    }
    if (quarter.intentSnapshot) {
      instant(errors, `${path}/intentSnapshot/capturedAt`, quarter.intentSnapshot.capturedAt);
      date(errors, `${path}/intentSnapshot/startDate`, quarter.intentSnapshot.startDate);
      date(errors, `${path}/intentSnapshot/endDate`, quarter.intentSnapshot.endDate);
      if (quarter.intentSnapshot.startDate > quarter.intentSnapshot.endDate) {
        errors.push(`${path}/intentSnapshot: startDate must precede endDate`);
      }
      if (!isIanaTimeZone(quarter.intentSnapshot.timeZoneAtCapture)) {
        errors.push(`${path}/intentSnapshot/timeZoneAtCapture: expected an IANA time zone`);
      }
    }
  }
  for (let index = 0; index < quarters.length; index += 1) {
    const left = quarters[index]!;
    for (const right of quarters.slice(index + 1)) {
      if (left.userId === right.userId && overlaps(left.startDate, left.endDate, right.startDate, right.endDate)) {
        errors.push(`/records/quarters: ${left.id} and ${right.id} overlap`);
      }
    }
  }

  for (const area of Object.values(state.records.focusAreas)) {
    const path = `/records/focusAreas/${area.id}`;
    if (!state.records.quarters[area.quarterId]) errors.push(`${path}/quarterId: quarter does not exist`);
    instant(errors, `${path}/createdAt`, area.createdAt);
    instant(errors, `${path}/updatedAt`, area.updatedAt);
    if (area.removedFromPlanAt) instant(errors, `${path}/removedFromPlanAt`, area.removedFromPlanAt);
  }

  const milestones = Object.values(state.records.milestones);
  for (const milestone of milestones) {
    const path = `/records/milestones/${milestone.id}`;
    const quarter = state.records.quarters[milestone.quarterId];
    if (!quarter) errors.push(`${path}/quarterId: quarter does not exist`);
    date(errors, `${path}/startDate`, milestone.startDate);
    date(errors, `${path}/endDate`, milestone.endDate);
    if (milestone.startDate > milestone.endDate) errors.push(`${path}: startDate must precede endDate`);
    if (quarter && (milestone.startDate < quarter.startDate || milestone.endDate > quarter.endDate)) {
      errors.push(`${path}: dates must lie inside the quarter`);
    }
    instant(errors, `${path}/createdAt`, milestone.createdAt);
    instant(errors, `${path}/updatedAt`, milestone.updatedAt);
    if (milestone.removedFromPlanAt) instant(errors, `${path}/removedFromPlanAt`, milestone.removedFromPlanAt);
    if (milestone.intentSnapshot) {
      instant(errors, `${path}/intentSnapshot/capturedAt`, milestone.intentSnapshot.capturedAt);
      date(errors, `${path}/intentSnapshot/startDate`, milestone.intentSnapshot.startDate);
      date(errors, `${path}/intentSnapshot/endDate`, milestone.intentSnapshot.endDate);
      if (milestone.intentSnapshot.startDate > milestone.intentSnapshot.endDate) {
        errors.push(`${path}/intentSnapshot: startDate must precede endDate`);
      }
      if (!isIanaTimeZone(milestone.intentSnapshot.timeZoneAtCapture)) {
        errors.push(`${path}/intentSnapshot/timeZoneAtCapture: expected an IANA time zone`);
      }
    }
  }
  for (let index = 0; index < milestones.length; index += 1) {
    const left = milestones[index]!;
    for (const right of milestones.slice(index + 1)) {
      if (left.quarterId === right.quarterId && overlaps(left.startDate, left.endDate, right.startDate, right.endDate)) {
        errors.push(`/records/milestones: ${left.id} and ${right.id} overlap`);
      }
    }
  }
}

function validateTasks(state: JourneyState, errors: string[]): void {
  const continuationSources = new Set<string>();
  for (const task of Object.values(state.records.tasks)) {
    const path = `/records/tasks/${task.id}`;
    const quarter = state.records.quarters[task.quarterId];
    const milestone = task.milestoneId ? state.records.milestones[task.milestoneId] : undefined;
    const area = task.focusAreaId ? state.records.focusAreas[task.focusAreaId] : undefined;
    if (!quarter) errors.push(`${path}/quarterId: quarter does not exist`);
    if (task.milestoneId && !milestone) errors.push(`${path}/milestoneId: milestone does not exist`);
    if (task.focusAreaId && !area) errors.push(`${path}/focusAreaId: focus area does not exist`);
    if (milestone && milestone.quarterId !== task.quarterId) errors.push(`${path}/milestoneId: must belong to task quarter`);
    if (area && area.quarterId !== task.quarterId) errors.push(`${path}/focusAreaId: must belong to task quarter`);
    date(errors, `${path}/plannedDate`, task.plannedDate);
    if (task.decisionPrompt?.initialReviewDate) {
      date(errors, `${path}/decisionPrompt/initialReviewDate`, task.decisionPrompt.initialReviewDate);
    }
    if (quarter && (task.plannedDate < quarter.startDate || task.plannedDate > quarter.endDate)) {
      errors.push(`${path}/plannedDate: must lie inside the quarter`);
    }
    if (milestone && (task.plannedDate < milestone.startDate || task.plannedDate > milestone.endDate)) {
      errors.push(`${path}/plannedDate: must lie inside the milestone`);
    }
    if (task.continuationOfTaskId) {
      if (continuationSources.has(task.continuationOfTaskId)) {
        errors.push(`/records/tasks: task ${task.continuationOfTaskId} has more than one continuation`);
      }
      continuationSources.add(task.continuationOfTaskId);
      const source = state.records.tasks[task.continuationOfTaskId];
      if (!source) errors.push(`${path}/continuationOfTaskId: source task does not exist`);
      else if (state.records.quarters[source.quarterId]?.userId !== quarter?.userId) {
        errors.push(`${path}/continuationOfTaskId: source task must belong to same user`);
      }
    }
    instant(errors, `${path}/createdAt`, task.createdAt);
    instant(errors, `${path}/updatedAt`, task.updatedAt);
    if (task.removedFromPlanAt) instant(errors, `${path}/removedFromPlanAt`, task.removedFromPlanAt);
    if (task.planSnapshot) {
      instant(errors, `${path}/planSnapshot/capturedAt`, task.planSnapshot.capturedAt);
      date(errors, `${path}/planSnapshot/plannedDate`, task.planSnapshot.plannedDate);
      if (task.planSnapshot.decisionPrompt?.initialReviewDate) {
        date(
          errors,
          `${path}/planSnapshot/decisionPrompt/initialReviewDate`,
          task.planSnapshot.decisionPrompt.initialReviewDate,
        );
      }
    }
  }
}

function validateExecutionRecords(state: JourneyState, errors: string[]): void {
  const sessionsByTask = new Map<string, SessionRecord[]>();
  const sessionsByUser = new Map<string, SessionRecord[]>();
  for (const session of Object.values(state.records.sessions)) {
    const path = `/records/sessions/${session.id}`;
    const task = state.records.tasks[session.taskId];
    if (!task) errors.push(`${path}/taskId: task does not exist`);
    instant(errors, `${path}/startedAt`, session.startedAt);
    if (session.endedAt) {
      instant(errors, `${path}/endedAt`, session.endedAt);
      if (session.endedAt < session.startedAt) errors.push(`${path}: endedAt must not precede startedAt`);
    }
    if (!isIanaTimeZone(session.timeZoneAtStart)) errors.push(`${path}/timeZoneAtStart: expected an IANA time zone`);
    instant(errors, `${path}/createdAt`, session.createdAt);
    instant(errors, `${path}/updatedAt`, session.updatedAt);
    if (session.correctedAt) instant(errors, `${path}/correctedAt`, session.correctedAt);
    const taskSessions = sessionsByTask.get(session.taskId) ?? [];
    taskSessions.push(session);
    sessionsByTask.set(session.taskId, taskSessions);
    const userId = task ? state.records.quarters[task.quarterId]?.userId : undefined;
    if (userId) {
      const userSessions = sessionsByUser.get(userId) ?? [];
      userSessions.push(session);
      sessionsByUser.set(userId, userSessions);
    }
  }
  for (const [userId, sessions] of sessionsByUser) {
    for (let index = 0; index < sessions.length; index += 1) {
      const left = sessions[index]!;
      for (const right of sessions.slice(index + 1)) {
        const intervalsOverlap =
          (right.endedAt === undefined || left.startedAt < right.endedAt) &&
          (left.endedAt === undefined || right.startedAt < left.endedAt);
        if (intervalsOverlap) {
          errors.push(
            `/records/sessions: user ${userId} sessions ${left.id} and ${right.id} overlap`,
          );
        }
      }
    }
  }

  const eventsByTask = new Map<string, TaskLifecycleEventRecord[]>();
  for (const event of Object.values(state.records.taskLifecycleEvents)) {
    const path = `/records/taskLifecycleEvents/${event.id}`;
    if (!state.records.tasks[event.taskId]) errors.push(`${path}/taskId: task does not exist`);
    instant(errors, `${path}/occurredAt`, event.occurredAt);
    instant(errors, `${path}/createdAt`, event.createdAt);
    if (!isIanaTimeZone(event.timeZoneAtOccurrence)) errors.push(`${path}/timeZoneAtOccurrence: expected an IANA time zone`);
    if (event.relatedTaskId && !state.records.tasks[event.relatedTaskId]) errors.push(`${path}/relatedTaskId: task does not exist`);
    const taskEvents = eventsByTask.get(event.taskId) ?? [];
    taskEvents.push(event);
    eventsByTask.set(event.taskId, taskEvents);
  }
  for (const [taskId, events] of eventsByTask) {
    const ordered = [...events].sort((left, right) => left.sequence - right.sequence);
    const sequences = ordered.map((event) => event.sequence);
    if (sequences.some((sequence, index) => sequence !== index + 1)) {
      errors.push(`/records/taskLifecycleEvents: task ${taskId} sequences must be contiguous from 1`);
    }
    for (let index = 1; index < ordered.length; index += 1) {
      if (ordered[index]!.occurredAt < ordered[index - 1]!.occurredAt) {
        errors.push(`/records/taskLifecycleEvents: task ${taskId} occurredAt must not move backwards with sequence`);
      }
    }
  }

  const reviewed = new Set<string>();
  for (const review of Object.values(state.records.dailyReviews)) {
    const path = `/records/dailyReviews/${review.id}`;
    if (!state.records.tasks[review.taskId]) errors.push(`${path}/taskId: task does not exist`);
    const event = state.records.taskLifecycleEvents[review.finishEventId];
    if (!event || event.taskId !== review.taskId || event.type !== "FINISHED") {
      errors.push(`${path}/finishEventId: must reference this task's FINISHED event`);
    }
    if (reviewed.has(review.finishEventId)) errors.push(`${path}/finishEventId: finish event already has a review`);
    reviewed.add(review.finishEventId);
    instant(errors, `${path}/createdAt`, review.createdAt);
    instant(errors, `${path}/updatedAt`, review.updatedAt);
  }
  for (const event of Object.values(state.records.taskLifecycleEvents)) {
    if (event.type === "FINISHED" && !reviewed.has(event.id)) {
      errors.push(`/records/taskLifecycleEvents/${event.id}: FINISHED event requires one DailyReview`);
    }
  }

  for (const task of Object.values(state.records.tasks)) {
    const sessions = sessionsByTask.get(task.id) ?? [];
    const events = eventsByTask.get(task.id) ?? [];
    const projection = projectTaskStatus(task, sessions, events);
    for (const projectionError of projection.errors) {
      errors.push(`/records/tasks/${task.id}/status: ${projectionError}`);
    }
    if (task.status !== projection.status) {
      errors.push(`/records/tasks/${task.id}/status: expected ${projection.status} from history`);
    }
    const historyBearing = sessions.length > 0 || events.length > 0 || Object.values(state.records.dailyReviews).some((review) => review.taskId === task.id);
    if (!historyBearing) continue;
    if (!task.planSnapshot) errors.push(`/records/tasks/${task.id}/planSnapshot: required once task has history`);
    const milestone = task.milestoneId ? state.records.milestones[task.milestoneId] : undefined;
    if (milestone && !milestone.intentSnapshot) {
      errors.push(`/records/milestones/${milestone.id}/intentSnapshot: required once a contained task has history`);
    }
    const quarter = state.records.quarters[task.quarterId];
    if (quarter && !quarter.intentSnapshot) {
      errors.push(`/records/quarters/${quarter.id}/intentSnapshot: required once a contained task has history`);
    }
  }
}

export function validateJourneyState(value: unknown): string[] {
  const errors = [...Value.Errors(JourneyStateSchema, value)].map(
    (error) => `${error.path || "/"}: ${error.message}`,
  );
  if (!Value.Check(JourneyStateSchema, value)) return errors;
  const state = value as JourneyState;
  instant(errors, "/writtenAt", state.writtenAt);

  for (const collectionName of collectionNames) {
    for (const [key, record] of Object.entries(state.records[collectionName])) {
      if (key !== record.id) errors.push(`/records/${collectionName}/${key}: map key must equal id`);
    }
  }
  for (const collectionName of ["journeyEntries", "decisionRecords", "decisionReviews", "aiReviews"] as const) {
    for (const key of Object.keys(state.records[collectionName])) {
      errors.push(`/records/${collectionName}/${key}: ${collectionName} records are not enabled in Slice 1`);
    }
  }
  for (const [key, user] of Object.entries(state.records.users)) {
    instant(errors, `/records/users/${key}/createdAt`, user.createdAt);
    if (!isIanaTimeZone(user.timeZone)) errors.push(`/records/users/${key}/timeZone: expected an IANA time zone`);
  }

  validateQuarterAndPlanRecords(state, errors);
  validateTasks(state, errors);
  validateExecutionRecords(state, errors);

  for (const [key, receipt] of Object.entries(state.commandReceipts)) {
    if (!state.records.users[receipt.userId]) errors.push(`/commandReceipts/${key}/userId: referenced user does not exist`);
    if (key !== `${receipt.userId}:${receipt.key}`) errors.push(`/commandReceipts/${key}: map key must equal userId:key`);
    instant(errors, `/commandReceipts/${key}/createdAt`, receipt.createdAt);
    if (receipt.committedStoreRevision > state.storeRevision) errors.push(`/commandReceipts/${key}: committed revision is in the future`);
  }
  return errors;
}
