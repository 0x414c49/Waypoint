import type { CurrentUserProvider } from "../../adapters/local-current-user-provider.js";
import type { CommandReceipt, DecisionOptionRecord, DecisionRecord, JourneyState } from "../../domain/journey-state.js";
import type { Clock } from "../../ports/clock.js";
import type { IdGenerator } from "../../ports/id-generator.js";
import { STANDARD_INTENT, type JourneyStore } from "../../ports/journey-store.js";
import { AppError, notFound } from "../app-error.js";
import { localDate, isCalendarDate } from "../dashboard/temporal.js";
import { captureQuarterContext, captureTaskPlanContext } from "../history/capture-plan-context.js";
import { opaqueHash, taskEtag } from "../task-etag.js";
import { decisionEtag, projectDecisionDetail } from "./decision-projection.js";

export interface DecisionDraftInput {
  title: string; quarterId?: string | null; relatedTaskId?: string | null; initialReviewDate?: string | null;
}
export interface DecisionEditInput {
  title: string; decisionDate?: string | null; context?: string | null; constraints: string[];
  options: DecisionOptionRecord[]; decision?: string | null; consequences?: string | null;
  assumptions: string[]; falsifier?: string | null; initialReviewDate?: string | null;
}
export interface DecisionReviewInput {
  outcome: "HOLDS" | "ADJUST" | "SUPERSEDE" | "DEFERRED";
  notes?: string | null; nextReviewDate?: string | null; replacementDecisionId?: string | null;
}

function validation(detail: string): never {
  throw new AppError(422, "VALIDATION_FAILED", "The request is not valid", detail);
}
function text(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
function assertDate(value: string | null | undefined, label: string): void {
  if (value && !isCalendarDate(value)) validation(`${label} must be a real date in YYYY-MM-DD form.`);
}
function nonBlankList(values: string[], label: string): string[] {
  if (values.some((value) => !value.trim())) validation(`${label} cannot contain blank items.`);
  return values.map((value) => value.trim());
}
function normalizeOptions(options: DecisionOptionRecord[]): DecisionOptionRecord[] {
  const ids = new Set<string>();
  return options.map((option, index) => {
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(option.id)) validation(`Option ${index + 1} has an invalid ID.`);
    if (ids.has(option.id)) validation(`Option IDs must be unique.`);
    ids.add(option.id);
    const title = text(option.title);
    const description = text(option.description);
    if (!title || !description) validation(`Option ${index + 1} requires a title and description.`);
    return {
      id: option.id,
      title,
      description,
      strengths: nonBlankList(option.strengths, `Option ${index + 1} strengths`),
      weaknesses: nonBlankList(option.weaknesses, `Option ${index + 1} weaknesses`),
    };
  });
}
function assertOwner(state: JourneyState, id: string, userId: string): DecisionRecord {
  const decision = state.records.decisionRecords[id];
  if (!decision || decision.userId !== userId) throw notFound();
  return decision;
}
function receipt(state: JourneyState, userId: string, key: string, fingerprint: string) {
  const existing = state.commandReceipts[`${userId}:${key}`];
  if (existing && existing.requestFingerprint !== fingerprint) throw new AppError(409, "IDEMPOTENCY_KEY_REUSED", "That action key was already used", "Use a new action key for a different request.");
  return existing;
}
function writeReceipt(state: JourneyState, userId: string, key: string, route: string, fingerprint: string, outcomeKind: string, created: string[], affected: string[], facts: Record<string, unknown>, at: string): void {
  const value: CommandReceipt = { userId, key, method: "POST", route, requestFingerprint: fingerprint, result: { outcomeKind, createdRecordIds: created, affectedRecordIds: affected, outcomeFacts: facts }, committedStoreRevision: state.storeRevision + 1, createdAt: at };
  state.commandReceipts[`${userId}:${key}`] = value;
}

export class DecisionCommandService {
  constructor(private readonly store: JourneyStore, private readonly currentUser: CurrentUserProvider, private readonly clock: Clock, private readonly ids: IdGenerator) {}

  async create(input: DecisionDraftInput, key: string, route = "/api/decisions") {
    const title = text(input.title); if (!title) validation("Give the draft a title.");
    assertDate(input.initialReviewDate, "Initial review date");
    const userId = await this.currentUser.getCurrentUserId(); const occurredAt = this.clock.now().toISOString();
    const body = { title, quarterId: input.quarterId ?? null, relatedTaskId: input.relatedTaskId ?? null, initialReviewDate: input.initialReviewDate ?? null };
    const fingerprint = opaqueHash({ method: "POST", route, body }); let replayed = false;
    const transaction = await this.store.transact(STANDARD_INTENT, (draft) => {
      const existing = receipt(draft, userId, key, fingerprint);
      if (existing) { replayed = true; return { kind: "no-change" as const, value: String(existing.result.outcomeFacts.decisionId) }; }
      const task = input.relatedTaskId ? draft.records.tasks[input.relatedTaskId] : undefined;
      if (input.relatedTaskId && (!task || draft.records.quarters[task.quarterId]?.userId !== userId)) throw notFound();
      const quarterId = task?.quarterId ?? input.quarterId ?? undefined;
      const quarter = quarterId ? draft.records.quarters[quarterId] : undefined;
      if (quarterId && (!quarter || quarter.userId !== userId)) throw notFound();
      if (task && input.quarterId && input.quarterId !== task.quarterId) validation("The related Task and Quarter must match.");
      const id = this.ids.generate(); const timeZone = draft.records.users[userId]!.timeZone;
      if (task) captureTaskPlanContext(draft, task, timeZone, occurredAt);
      else if (quarter) captureQuarterContext(draft, quarter.id, timeZone, occurredAt);
      draft.records.decisionRecords[id] = { id, userId, ...(quarterId ? { quarterId } : {}), ...(task ? { relatedTaskId: task.id } : {}), title, status: "DRAFT", constraints: [], options: [], assumptions: [], ...(input.initialReviewDate ? { initialReviewDate: input.initialReviewDate } : {}), createdAt: occurredAt, updatedAt: occurredAt };
      writeReceipt(draft, userId, key, route, fingerprint, "CREATE_DECISION", [id], [id], { decisionId: id }, occurredAt);
      return { kind: "changed" as const, value: id };
    });
    return { decision: projectDecisionDetail(transaction.state, transaction.state.records.decisionRecords[transaction.value]!), replayed, created: !replayed };
  }

  async createFromTask(taskId: string, ifMatch: string, key: string, route: string) {
    const userId = await this.currentUser.getCurrentUserId(); const occurredAt = this.clock.now().toISOString();
    const fingerprint = opaqueHash({ method: "POST", route, body: {}, ifMatch }); let replayed = false; let created = false;
    const transaction = await this.store.transact(STANDARD_INTENT, (draft) => {
      const existingReceipt = receipt(draft, userId, key, fingerprint);
      if (existingReceipt) { replayed = true; return { kind: "no-change" as const, value: String(existingReceipt.result.outcomeFacts.decisionId) }; }
      const task = draft.records.tasks[taskId];
      if (!task || draft.records.quarters[task.quarterId]?.userId !== userId) throw notFound();
      if (taskEtag(draft, task) !== ifMatch) throw new AppError(412, "STALE_WRITE", "This item changed", "Refresh the item before starting its decision draft.", { current: { taskId: task.id }, resolutions: [{ kind: "REFRESH" }] });
      const prompt = task.planSnapshot ? task.planSnapshot.decisionPrompt : task.decisionPrompt;
      if (!prompt) validation("This Task does not contain a decision prompt.");
      const existing = draft.records.decisionRecords[prompt.decisionId];
      if (existing) {
        if (existing.userId !== userId || existing.relatedTaskId !== task.id) throw new AppError(409, "PROMPT_DECISION_CONFLICT", "This decision prompt is already linked", "The prompt Decision ID belongs to a different relationship.");
      } else {
        captureTaskPlanContext(draft, task, draft.records.users[userId]!.timeZone, occurredAt);
        draft.records.decisionRecords[prompt.decisionId] = { id: prompt.decisionId, userId, quarterId: task.quarterId, relatedTaskId: task.id, title: prompt.suggestedTitle, status: "DRAFT", constraints: [], options: [], assumptions: [], ...(prompt.initialReviewDate ? { initialReviewDate: prompt.initialReviewDate } : {}), createdAt: occurredAt, updatedAt: occurredAt };
        created = true;
      }
      writeReceipt(draft, userId, key, route, fingerprint, "CREATE_CONTEXTUAL_DECISION", created ? [prompt.decisionId] : [], [task.id, prompt.decisionId], { decisionId: prompt.decisionId }, occurredAt);
      return { kind: "changed" as const, value: prompt.decisionId };
    });
    return { decision: projectDecisionDetail(transaction.state, transaction.state.records.decisionRecords[transaction.value]!), replayed, created };
  }

  async update(id: string, input: DecisionEditInput, ifMatch: string) {
    const title = text(input.title); if (!title) validation("Give the draft a title.");
    assertDate(input.decisionDate, "Decision date"); assertDate(input.initialReviewDate, "Initial review date");
    if (input.decisionDate && input.initialReviewDate && input.initialReviewDate < input.decisionDate) validation("Initial review date must be on or after the decision date.");
    const constraints = nonBlankList(input.constraints, "Constraints");
    const options = normalizeOptions(input.options);
    const assumptions = nonBlankList(input.assumptions, "Assumptions");
    const userId = await this.currentUser.getCurrentUserId(); const updatedAt = this.clock.now().toISOString();
    const result = await this.store.transact(STANDARD_INTENT, (draft) => {
      const decision = assertOwner(draft, id, userId);
      if (decisionEtag(draft, decision) !== ifMatch) throw new AppError(412, "STALE_WRITE", "This decision changed", "Refresh it before saving.", { current: { decision: projectDecisionDetail(draft, decision) }, resolutions: [{ kind: "REFRESH" }] });
      if (decision.status !== "DRAFT") throw new AppError(409, "DECISION_IMMUTABLE", "Accepted reasoning cannot be edited", "Create a review or a replacement decision instead.");
      Object.assign(decision, { title, constraints, options, assumptions, updatedAt });
      for (const [field, value] of [["decisionDate", input.decisionDate], ["context", text(input.context)], ["decision", text(input.decision)], ["consequences", text(input.consequences)], ["falsifier", text(input.falsifier)], ["initialReviewDate", input.initialReviewDate]] as const) {
        if (value) (decision as unknown as Record<string, unknown>)[field] = value;
        else delete (decision as unknown as Record<string, unknown>)[field];
      }
      return { kind: "changed" as const, value: id };
    });
    return projectDecisionDetail(result.state, result.state.records.decisionRecords[id]!);
  }

  async accept(id: string, input: { decisionDate?: string | null }, ifMatch: string, key: string, route: string) {
    assertDate(input.decisionDate, "Decision date"); const userId = await this.currentUser.getCurrentUserId(); const occurredAt = this.clock.now().toISOString();
    const fingerprint = opaqueHash({ method: "POST", route, body: { decisionDate: input.decisionDate ?? null }, ifMatch }); let replayed = false;
    const result = await this.store.transact(STANDARD_INTENT, (draft) => {
      const existing = receipt(draft, userId, key, fingerprint); if (existing) { replayed = true; return { kind: "no-change" as const, value: id }; }
      const decision = assertOwner(draft, id, userId);
      if (decisionEtag(draft, decision) !== ifMatch) throw new AppError(412, "STALE_WRITE", "This decision changed", "Refresh it before accepting it.", { current: { decision: projectDecisionDetail(draft, decision) }, resolutions: [{ kind: "REFRESH" }] });
      if (decision.status !== "DRAFT") throw new AppError(409, "INVALID_DECISION_TRANSITION", "This decision cannot be accepted", "Only a Draft can be accepted.");
      const decisionDate = decision.decisionDate ?? input.decisionDate ?? undefined;
      if (!decision.title.trim() || !decision.context?.trim() || !decision.decision?.trim() || !decisionDate) validation("Accept requires a title, context, decision, and decision date.");
      if (decision.initialReviewDate && decision.initialReviewDate < decisionDate) validation("Initial review date must be on or after the decision date.");
      decision.decisionDate = decisionDate; decision.status = "ACCEPTED"; decision.updatedAt = occurredAt;
      writeReceipt(draft, userId, key, route, fingerprint, "ACCEPT_DECISION", [], [id], { decisionId: id }, occurredAt);
      return { kind: "changed" as const, value: id };
    });
    return { decision: projectDecisionDetail(result.state, result.state.records.decisionRecords[id]!), replayed };
  }

  async review(id: string, input: DecisionReviewInput, ifMatch: string, key: string, route: string) {
    assertDate(input.nextReviewDate, "Next review date"); const userId = await this.currentUser.getCurrentUserId(); const reviewedAt = this.clock.now().toISOString();
    const normalized = { outcome: input.outcome, notes: text(input.notes) ?? null, nextReviewDate: input.nextReviewDate ?? null, replacementDecisionId: input.replacementDecisionId ?? null };
    const fingerprint = opaqueHash({ method: "POST", route, body: normalized, ifMatch }); let replayed = false;
    const result = await this.store.transact(STANDARD_INTENT, (draft) => {
      const existing = receipt(draft, userId, key, fingerprint); if (existing) { replayed = true; return { kind: "no-change" as const, value: String(existing.result.outcomeFacts.reviewId) }; }
      const decision = assertOwner(draft, id, userId);
      if (decisionEtag(draft, decision) !== ifMatch) throw new AppError(412, "STALE_WRITE", "This decision changed", "Refresh it before adding a review.", { current: { decision: projectDecisionDetail(draft, decision) }, resolutions: [{ kind: "REFRESH" }] });
      if (decision.status !== "ACCEPTED") throw new AppError(409, "INVALID_DECISION_TRANSITION", "This decision cannot be reviewed", "Only an Accepted decision can receive a review.");
      const reviewDate = localDate(reviewedAt, draft.records.users[userId]!.timeZone);
      if (input.nextReviewDate && input.nextReviewDate <= reviewDate) validation("Next review date must be later than the review date.");
      if (input.outcome === "DEFERRED" && !input.nextReviewDate) validation("Postpone requires a later review date.");
      if (input.outcome !== "SUPERSEDE" && input.replacementDecisionId) validation("A replacement is allowed only when superseding.");
      const replacement = input.replacementDecisionId ? assertOwner(draft, input.replacementDecisionId, userId) : undefined;
      if (replacement) {
        if (replacement.id === decision.id) validation("A decision cannot replace itself.");
        if (replacement.status !== "DRAFT") validation("The replacement must still be a Draft.");
        if (replacement.supersedesDecisionId && replacement.supersedesDecisionId !== decision.id) validation("The replacement already has conflicting ancestry.");
        let ancestor: DecisionRecord | undefined = decision;
        while (ancestor?.supersedesDecisionId) { ancestor = draft.records.decisionRecords[ancestor.supersedesDecisionId]; if (ancestor?.id === replacement.id) validation("The replacement would create a supersession cycle."); }
        replacement.supersedesDecisionId = decision.id; replacement.updatedAt = reviewedAt;
      }
      const sequence = Math.max(0, ...Object.values(draft.records.decisionReviews).filter((review) => review.decisionId === id).map((review) => review.sequence)) + 1;
      const reviewId = this.ids.generate();
      draft.records.decisionReviews[reviewId] = { id: reviewId, decisionId: id, sequence, reviewedAt, timeZoneAtReview: draft.records.users[userId]!.timeZone, outcome: input.outcome, ...(normalized.notes ? { notes: normalized.notes } : {}), ...(input.nextReviewDate ? { nextReviewDate: input.nextReviewDate } : {}), ...(replacement ? { replacementDecisionId: replacement.id } : {}), createdAt: reviewedAt };
      decision.updatedAt = reviewedAt; if (input.outcome === "SUPERSEDE") decision.status = "SUPERSEDED";
      writeReceipt(draft, userId, key, route, fingerprint, "REVIEW_DECISION", [reviewId], [id, ...(replacement ? [replacement.id] : [])], { decisionId: id, reviewId }, reviewedAt);
      return { kind: "changed" as const, value: reviewId };
    });
    return { decision: projectDecisionDetail(result.state, result.state.records.decisionRecords[id]!), reviewId: result.value, replayed };
  }
}
