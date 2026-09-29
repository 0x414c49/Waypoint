import type { CurrentUserProvider } from "../../adapters/local-current-user-provider.js";
import type { CommandReceipt, JourneyState, TaskLifecycleEventRecord, TaskRecord } from "../../domain/journey-state.js";
import type { Clock } from "../../ports/clock.js";
import type { IdGenerator } from "../../ports/id-generator.js";
import { STANDARD_INTENT, type JourneyStore } from "../../ports/journey-store.js";
import { AppError } from "../app-error.js";
import { projectDashboard } from "../dashboard/dashboard.js";
import { projectTask } from "../dashboard/task-projection.js";
import { isCalendarDate } from "../dashboard/temporal.js";
import { captureTaskPlanContext } from "../history/capture-plan-context.js";
import { opaqueHash, taskEtag } from "../task-etag.js";
import { assertTaskOwner } from "./task-transitions.js";

interface CarryOutcome { sourceId: string; continuationId: string; finishEventId: string; reviewId: string; carriedEventId: string; undoUntil: string }

function appendEvent(state: JourneyState, task: TaskRecord, id: string, type: TaskLifecycleEventRecord["type"], occurredAt: string, timeZone: string, relatedTaskId?: string) {
  const sequence = Math.max(0, ...Object.values(state.records.taskLifecycleEvents).filter((event) => event.taskId === task.id).map((event) => event.sequence)) + 1;
  state.records.taskLifecycleEvents[id] = { id, taskId: task.id, sequence, type, occurredAt, timeZoneAtOccurrence: timeZone, ...(relatedTaskId ? { relatedTaskId } : {}), createdAt: occurredAt };
}

export class CarryForwardService {
  constructor(private readonly store: JourneyStore, private readonly currentUser: CurrentUserProvider, private readonly clock: Clock, private readonly ids: IdGenerator) {}

  async execute(taskId: string, input: { plannedDate: string; keyLearning?: string }, ifMatch: string, key: string, route: string) {
    if (!isCalendarDate(input.plannedDate)) {
      throw new AppError(422, "VALIDATION_FAILED", "The continuation date is not valid", "Use a real calendar date in YYYY-MM-DD form.");
    }
    const userId = await this.currentUser.getCurrentUserId();
    const now = this.clock.now();
    const occurredAt = now.toISOString();
    const fingerprint = opaqueHash({ method: "POST", route, body: { plannedDate: input.plannedDate, keyLearning: input.keyLearning ?? null }, ifMatch });
    const receiptKey = `${userId}:${key}`;
    let replayed = false;
    const transaction = await this.store.transact(STANDARD_INTENT, (draft) => {
      const receipt = draft.commandReceipts[receiptKey];
      if (receipt) {
        if (receipt.requestFingerprint !== fingerprint) throw new AppError(409, "IDEMPOTENCY_KEY_REUSED", "That action key was already used", "Use a new action key for a different request.");
        replayed = true;
        return { kind: "no-change" as const, value: receipt.result.outcomeFacts as unknown as CarryOutcome };
      }
      const source = assertTaskOwner(draft, taskId, userId);
      if (taskEtag(draft, source) !== ifMatch) throw new AppError(412, "STALE_WRITE", "This item changed", "Refresh the item before carrying it forward.", { current: { task: projectTask(draft, source, occurredAt) }, resolutions: [{ kind: "REFRESH" }] });
      const existing = Object.values(draft.records.tasks).find((task) => task.continuationOfTaskId === source.id);
      let outcome: CarryOutcome;
      let created = false;
      if (existing) {
        const carried = Object.values(draft.records.taskLifecycleEvents).find((event) => event.taskId === source.id && event.type === "CARRIED_FORWARD" && event.relatedTaskId === existing.id);
        const finish = Object.values(draft.records.taskLifecycleEvents).find((event) => event.taskId === source.id && event.type === "FINISHED" && event.sequence === (carried?.sequence ?? 0) - 1);
        const review = finish && Object.values(draft.records.dailyReviews).find((candidate) => candidate.finishEventId === finish.id);
        if (!finish || !review || !carried) throw new Error("Validated continuation is missing its carry-forward history.");
        if (existing.plannedDate !== input.plannedDate || (review.keyLearning ?? undefined) !== input.keyLearning) {
          throw new AppError(409, "CONTINUATION_EXISTS", "This work already has a continuation", "Open the existing continuation instead of creating another one.", {
            current: { continuation: { id: existing.id, plannedDate: existing.plannedDate } },
          });
        }
        outcome = { sourceId: source.id, continuationId: existing.id, finishEventId: finish.id, reviewId: review.id, carriedEventId: carried.id, undoUntil: new Date(Date.parse(finish.occurredAt) + 5 * 60_000).toISOString() };
      } else {
        if (source.status !== "IN_PROGRESS" && source.status !== "PAUSED") throw new AppError(409, "INVALID_TASK_TRANSITION", "This item cannot be carried forward", "Carry forward is available only after work has started.");
        const quarter = draft.records.quarters[source.quarterId]!;
        if (input.plannedDate < quarter.startDate || input.plannedDate > quarter.endDate) throw new AppError(422, "VALIDATION_FAILED", "The date is outside this quarter", "Choose a date within the same quarter.");
        const destination = Object.values(draft.records.milestones).find((milestone) => milestone.quarterId === quarter.id && !milestone.removedFromPlanAt && milestone.startDate <= input.plannedDate && milestone.endDate >= input.plannedDate);
        if (!destination) throw new AppError(422, "VALIDATION_FAILED", "No milestone contains that date", "Choose a date inside a current milestone.");
        captureTaskPlanContext(draft, source, draft.records.users[userId]!.timeZone, occurredAt);
        const active = Object.values(draft.records.sessions).find((session) => !session.endedAt && session.taskId === source.id);
        if (active) { active.endedAt = occurredAt; active.updatedAt = occurredAt; }
        const continuationId = this.ids.generate();
        const finishEventId = this.ids.generate();
        const reviewId = this.ids.generate();
        const carriedEventId = this.ids.generate();
        const position = Math.max(-1, ...Object.values(draft.records.tasks).filter((task) => task.milestoneId === destination.id).map((task) => task.position)) + 1;
        const historical = source.planSnapshot;
        const focusAreaId = historical ? historical.focusAreaId : source.focusAreaId;
        const description = historical ? historical.description : source.description;
        const plannedMinutes = historical ? historical.plannedMinutes : source.plannedMinutes;
        const decisionPrompt = historical ? historical.decisionPrompt : source.decisionPrompt;
        draft.records.tasks[continuationId] = {
          id: continuationId, quarterId: source.quarterId,
          ...(focusAreaId ? { focusAreaId } : {}), milestoneId: destination.id,
          plannedDate: input.plannedDate, title: historical ? historical.title : source.title,
          ...(description ? { description } : {}),
          ...(plannedMinutes ? { plannedMinutes } : {}),
          tags: [...(historical ? historical.tags : source.tags)], position,
          recommendationMode: historical ? historical.recommendationMode : source.recommendationMode,
          ...(decisionPrompt ? { decisionPrompt: structuredClone(decisionPrompt) } : {}),
          status: "NOT_STARTED", continuationOfTaskId: source.id, createdAt: occurredAt, updatedAt: occurredAt,
        };
        appendEvent(draft, source, finishEventId, "FINISHED", occurredAt, draft.records.users[userId]!.timeZone);
        draft.records.dailyReviews[reviewId] = { id: reviewId, taskId: source.id, finishEventId, outcome: "PARTIAL", ...(input.keyLearning ? { keyLearning: input.keyLearning } : {}), createdAt: occurredAt, updatedAt: occurredAt };
        appendEvent(draft, source, carriedEventId, "CARRIED_FORWARD", occurredAt, draft.records.users[userId]!.timeZone, continuationId);
        source.status = "FINISHED"; source.updatedAt = occurredAt;
        outcome = { sourceId: source.id, continuationId, finishEventId, reviewId, carriedEventId, undoUntil: new Date(now.valueOf() + 5 * 60_000).toISOString() };
        created = true;
      }
      const commandReceipt: CommandReceipt = { userId, key, method: "POST", route, requestFingerprint: fingerprint, result: { outcomeKind: "CARRY_FORWARD", createdRecordIds: created ? [outcome.continuationId, outcome.finishEventId, outcome.reviewId, outcome.carriedEventId] : [], affectedRecordIds: [outcome.sourceId, outcome.continuationId], outcomeFacts: outcome as unknown as Record<string, unknown> }, committedStoreRevision: draft.storeRevision + 1, createdAt: occurredAt };
      draft.commandReceipts[receiptKey] = commandReceipt;
      return { kind: "changed" as const, value: outcome };
    });
    const outcome = transaction.value;
    return {
      response: {
        source: projectTask(transaction.state, transaction.state.records.tasks[outcome.sourceId]!, occurredAt),
        completion: { taskId: outcome.sourceId, finishEventId: outcome.finishEventId, reviewId: outcome.reviewId, outcome: "PARTIAL" as const, undoUntil: outcome.undoUntil },
        continuation: projectTask(transaction.state, transaction.state.records.tasks[outcome.continuationId]!, occurredAt),
        dashboard: projectDashboard(transaction.state, userId, now),
      }, replayed,
    };
  }
}
