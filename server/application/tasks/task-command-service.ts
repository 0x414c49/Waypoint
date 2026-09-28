import type { CurrentUserProvider } from "../../adapters/local-current-user-provider.js";
import type { CommandReceipt } from "../../domain/journey-state.js";
import type { Clock } from "../../ports/clock.js";
import type { IdGenerator } from "../../ports/id-generator.js";
import { STANDARD_INTENT, type JourneyStore } from "../../ports/journey-store.js";
import { AppError } from "../app-error.js";
import { projectDashboard } from "../dashboard/dashboard.js";
import { projectTask } from "../dashboard/task-projection.js";
import { opaqueHash, taskEtag } from "../task-etag.js";
import type {
  CommandOutcome,
  TaskActionResponse,
  TaskCommandRequest,
} from "./task-command-types.js";
import { applyTaskTransition, assertTaskOwner } from "./task-transitions.js";

export type {
  ActiveSessionResolution,
  TaskAction,
  TaskActionResponse,
  TaskCommandBody,
  TaskCommandRequest,
} from "./task-command-types.js";

function createdRecordIds(outcome: CommandOutcome): string[] {
  return [
    outcome.sessionId,
    outcome.finishEventId,
    outcome.reviewId,
    outcome.reopenedEventId,
  ].filter((value): value is string => Boolean(value));
}

export class TaskCommandService {
  constructor(
    private readonly store: JourneyStore,
    private readonly currentUser: CurrentUserProvider,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(
    request: TaskCommandRequest,
  ): Promise<{ response: TaskActionResponse; replayed: boolean }> {
    const userId = await this.currentUser.getCurrentUserId();
    const now = this.clock.now();
    const occurredAt = now.toISOString();
    const fingerprint = opaqueHash({
      method: request.method,
      route: request.route,
      body: request.body,
      ifMatch: request.ifMatch,
    });
    const receiptKey = `${userId}:${request.idempotencyKey}`;
    let replayed = false;
    const transaction = await this.store.transact(STANDARD_INTENT, (draft) => {
      const existing = draft.commandReceipts[receiptKey];
      if (existing) {
        if (existing.requestFingerprint !== fingerprint) {
          throw new AppError(
            409,
            "IDEMPOTENCY_KEY_REUSED",
            "That action key was already used",
            "Use a new action key for a different request.",
          );
        }
        replayed = true;
        return {
          kind: "no-change",
          value: existing.result.outcomeFacts as unknown as CommandOutcome,
        };
      }

      const task = assertTaskOwner(draft, request.taskId, userId);
      if (taskEtag(draft, task) !== request.ifMatch) {
        throw new AppError(
          412,
          "STALE_WRITE",
          "This item changed",
          "Refresh the item before applying this action.",
          {
            current: { task: projectTask(draft, task, occurredAt) },
            resolutions: [{ kind: "REFRESH" }],
          },
        );
      }
      const user = draft.records.users[userId]!;
      const outcome = applyTaskTransition(
        draft,
        task,
        request,
        this.ids,
        now,
        user.timeZone,
      );
      const receipt: CommandReceipt = {
        userId,
        key: request.idempotencyKey,
        method: request.method,
        route: request.route,
        requestFingerprint: fingerprint,
        result: {
          outcomeKind: request.action.toUpperCase(),
          createdRecordIds: createdRecordIds(outcome),
          affectedRecordIds: outcome.affectedTaskIds,
          outcomeFacts: outcome as unknown as Record<string, unknown>,
        },
        committedStoreRevision: draft.storeRevision + 1,
        createdAt: occurredAt,
      };
      draft.commandReceipts[receiptKey] = receipt;
      return { kind: "changed", value: outcome };
    });

    const state = transaction.state;
    const outcome = transaction.value;
    const task = state.records.tasks[outcome.taskId]!;
    const dashboard = projectDashboard(state, userId, now);
    const response: TaskActionResponse = {
      task: projectTask(state, task, occurredAt),
      activeSession: dashboard.activeSession,
      affectedTasks: outcome.affectedTaskIds
        .filter((id) => id !== task.id)
        .map((id) => projectTask(state, state.records.tasks[id]!, occurredAt)),
      dashboard,
      ...(outcome.finishEventId && outcome.reviewId && outcome.outcome && outcome.undoUntil
        ? {
            completion: {
              taskId: task.id,
              finishEventId: outcome.finishEventId,
              reviewId: outcome.reviewId,
              outcome: outcome.outcome,
              undoUntil: outcome.undoUntil,
            },
          }
        : {}),
      ...(outcome.reopenedEventId && outcome.closureEventId
        ? {
            reopened: {
              taskId: task.id,
              reopenedEventId: outcome.reopenedEventId,
              closureEventId: outcome.closureEventId,
            },
          }
        : {}),
    };
    return { response, replayed };
  }
}
