import type { CurrentUserProvider } from "../../adapters/local-current-user-provider.js";
import type { CommandReceipt, JourneyEntryRecord, JourneyState } from "../../domain/journey-state.js";
import type { Clock } from "../../ports/clock.js";
import type { IdGenerator } from "../../ports/id-generator.js";
import { STANDARD_INTENT, type JourneyStore } from "../../ports/journey-store.js";
import { AppError, notFound } from "../app-error.js";
import { captureMilestoneContext, captureTaskPlanContext } from "../history/capture-plan-context.js";
import { opaqueHash } from "../task-etag.js";
import { journeyEntryEtag, projectJourneyEntry } from "./journey-projection.js";

export interface JourneyEntryInput {
  text: string;
  tags?: string[];
  changedMyMind?: boolean;
  feeling?: "curious" | "steady" | "stuck" | "uncertain" | "proud" | "tired" | null;
  relatedTaskId?: string | null;
  relatedMilestoneId?: string | null;
  relatedDecisionId?: string | null;
}

function assertText(text: string): void {
  if (!text.trim()) throw new AppError(422, "VALIDATION_FAILED", "The thought is empty", "Write a thought before saving it.", {
    fieldErrors: [{ path: "/text", code: "REQUIRED", message: "Write a thought before saving it." }],
  });
}

function activeTaskIdForUser(state: JourneyState, userId: string): string | undefined {
  const active = Object.values(state.records.sessions).find((session) => !session.endedAt);
  if (!active) return undefined;
  const task = state.records.tasks[active.taskId];
  return task && state.records.quarters[task.quarterId]?.userId === userId ? task.id : undefined;
}

export class JourneyCommandService {
  constructor(
    private readonly store: JourneyStore,
    private readonly currentUser: CurrentUserProvider,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async create(input: JourneyEntryInput, key: string, route = "/api/journey") {
    assertText(input.text);
    const userId = await this.currentUser.getCurrentUserId();
    const occurredAt = this.clock.now().toISOString();
    const normalizedBody = {
      text: input.text,
      tags: input.tags ?? [],
      changedMyMind: input.changedMyMind ?? false,
      feeling: input.feeling ?? null,
      relatedTask: Object.prototype.hasOwnProperty.call(input, "relatedTaskId")
        ? input.relatedTaskId ?? null
        : "INFER_ACTIVE",
      relatedMilestoneId: input.relatedMilestoneId ?? null,
      relatedDecisionId: input.relatedDecisionId ?? null,
    };
    const fingerprint = opaqueHash({ method: "POST", route, body: normalizedBody });
    const receiptKey = `${userId}:${key}`;
    let replayed = false;
    const result = await this.store.transact(STANDARD_INTENT, (draft) => {
      const existing = draft.commandReceipts[receiptKey];
      if (existing) {
        if (existing.requestFingerprint !== fingerprint) throw new AppError(409, "IDEMPOTENCY_KEY_REUSED", "That action key was already used", "Use a new action key for a different request.");
        replayed = true;
        return { kind: "no-change" as const, value: String(existing.result.outcomeFacts.entryId) };
      }
      const inferredTaskId = activeTaskIdForUser(draft, userId);
      const relatedTaskId = Object.prototype.hasOwnProperty.call(input, "relatedTaskId")
        ? input.relatedTaskId ?? undefined
        : inferredTaskId;
      const task = relatedTaskId ? draft.records.tasks[relatedTaskId] : undefined;
      if (relatedTaskId && (!task || draft.records.quarters[task.quarterId]?.userId !== userId)) throw notFound();
      const milestone = input.relatedMilestoneId ? draft.records.milestones[input.relatedMilestoneId] : undefined;
      if (input.relatedMilestoneId && (!milestone || draft.records.quarters[milestone.quarterId]?.userId !== userId)) throw notFound();
      if (task && milestone && task.quarterId !== milestone.quarterId) {
        throw new AppError(422, "VALIDATION_FAILED", "The relationships do not match", "Choose a task and milestone from the same quarter.");
      }
      if (input.relatedDecisionId && draft.records.decisionRecords[input.relatedDecisionId]?.userId !== userId) throw notFound();
      if (task) captureTaskPlanContext(draft, task, draft.records.users[userId]!.timeZone, occurredAt);
      if (milestone) captureMilestoneContext(draft, milestone, draft.records.users[userId]!.timeZone, occurredAt);
      const id = this.ids.generate();
      const entry: JourneyEntryRecord = {
        id, userId, occurredAt, timeZoneAtOccurrence: draft.records.users[userId]!.timeZone,
        text: input.text, tags: [...(input.tags ?? [])], changedMyMind: input.changedMyMind ?? false,
        ...(input.feeling ? { feeling: input.feeling } : {}),
        ...(relatedTaskId ? { relatedTaskId } : {}),
        ...(input.relatedMilestoneId ? { relatedMilestoneId: input.relatedMilestoneId } : {}),
        ...(input.relatedDecisionId ? { relatedDecisionId: input.relatedDecisionId } : {}),
        createdAt: occurredAt,
      };
      draft.records.journeyEntries[id] = entry;
      const receipt: CommandReceipt = {
        userId, key, method: "POST", route, requestFingerprint: fingerprint,
        result: { outcomeKind: "JOURNEY_CREATE", createdRecordIds: [id], affectedRecordIds: [id], outcomeFacts: { entryId: id } },
        committedStoreRevision: draft.storeRevision + 1, createdAt: occurredAt,
      };
      draft.commandReceipts[receiptKey] = receipt;
      return { kind: "changed" as const, value: id };
    });
    const entry = result.state.records.journeyEntries[result.value];
    if (!entry) {
      throw new AppError(
        410,
        "IDEMPOTENT_RESULT_DELETED",
        "That saved thought was deleted",
        "This retry cannot recreate an explicitly deleted thought. Use a new action key to save a new thought.",
      );
    }
    return { entry: projectJourneyEntry(result.state, entry), replayed };
  }

  async update(id: string, input: Required<Pick<JourneyEntryInput, "text" | "tags" | "changedMyMind">> & JourneyEntryInput, ifMatch: string) {
    assertText(input.text);
    const userId = await this.currentUser.getCurrentUserId();
    const updatedAt = this.clock.now().toISOString();
    const result = await this.store.transact(STANDARD_INTENT, (draft) => {
      const entry = draft.records.journeyEntries[id];
      if (!entry || entry.userId !== userId) throw notFound();
      if (journeyEntryEtag(entry) !== ifMatch) throw new AppError(412, "STALE_WRITE", "This thought changed", "Refresh it before saving your changes.", { current: { entry: projectJourneyEntry(draft, entry) }, resolutions: [{ kind: "REFRESH" }] });
      const task = input.relatedTaskId ? draft.records.tasks[input.relatedTaskId] : undefined;
      const milestone = input.relatedMilestoneId ? draft.records.milestones[input.relatedMilestoneId] : undefined;
      if (input.relatedTaskId && (!task || draft.records.quarters[task.quarterId]?.userId !== userId)) throw notFound();
      if (input.relatedMilestoneId && (!milestone || draft.records.quarters[milestone.quarterId]?.userId !== userId)) throw notFound();
      if (task && milestone && task.quarterId !== milestone.quarterId) throw new AppError(422, "VALIDATION_FAILED", "The relationships do not match", "Choose a task and milestone from the same quarter.");
      if (input.relatedDecisionId && draft.records.decisionRecords[input.relatedDecisionId]?.userId !== userId) throw notFound();
      if (task) captureTaskPlanContext(draft, task, draft.records.users[userId]!.timeZone, updatedAt);
      if (milestone) captureMilestoneContext(draft, milestone, draft.records.users[userId]!.timeZone, updatedAt);
       entry.text = input.text; entry.tags = [...input.tags]; entry.changedMyMind = input.changedMyMind;
       if (Object.prototype.hasOwnProperty.call(input, "feeling")) {
         if (input.feeling) entry.feeling = input.feeling; else delete entry.feeling;
       }
      if (input.relatedTaskId) entry.relatedTaskId = input.relatedTaskId; else delete entry.relatedTaskId;
      if (input.relatedMilestoneId) entry.relatedMilestoneId = input.relatedMilestoneId; else delete entry.relatedMilestoneId;
      if (input.relatedDecisionId) entry.relatedDecisionId = input.relatedDecisionId; else delete entry.relatedDecisionId;
      entry.updatedAt = updatedAt;
      return { kind: "changed" as const, value: id };
    });
    return projectJourneyEntry(result.state, result.state.records.journeyEntries[id]!);
  }

  async delete(id: string, ifMatch: string): Promise<void> {
    const userId = await this.currentUser.getCurrentUserId();
    await this.store.transact({ kind: "JOURNEY_DELETE", journeyEntryId: id }, (draft) => {
      const entry = draft.records.journeyEntries[id];
      if (!entry || entry.userId !== userId) throw notFound();
      if (journeyEntryEtag(entry) !== ifMatch) throw new AppError(412, "STALE_WRITE", "This thought changed", "Refresh it before deleting it.", { current: { entry: projectJourneyEntry(draft, entry) }, resolutions: [{ kind: "REFRESH" }] });
      delete draft.records.journeyEntries[id];
      return { kind: "changed" as const, value: undefined };
    });
  }
}
