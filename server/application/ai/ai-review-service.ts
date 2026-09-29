import type { AIReviewRecord, AIReviewTargetType, JourneyState } from "../../domain/journey-state.js";
import type { AIReviewOutput, AIReviewRequest, AIReviewer } from "../../ports/ai-reviewer.js";
import type { Clock } from "../../ports/clock.js";
import type { IdGenerator } from "../../ports/id-generator.js";
import { STANDARD_INTENT, type JourneyStore } from "../../ports/journey-store.js";
import type { CurrentUserProvider } from "../../adapters/local-current-user-provider.js";
import { AppError, notFound } from "../app-error.js";
import { localDate } from "../dashboard/temporal.js";
import { captureMilestoneContext, captureQuarterContext, captureTaskPlanContext } from "../history/capture-plan-context.js";
import { opaqueHash } from "../task-etag.js";

interface ReviewTarget {
  readonly request: AIReviewRequest;
  readonly fingerprint: string;
}

function boundedText(value: string | undefined, label: string): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > 20_000) {
    throw new AppError(503, "AI_REVIEW_FAILED", "Generated advice is unavailable", `The ${label} content is outside the supported bounds. No advice was saved.`);
  }
  return normalized;
}

function normalizeOutput(output: AIReviewOutput): Omit<AIReviewRecord, "id" | "userId" | "targetType" | "targetId" | "generatedAt" | "timeZoneAtGeneration"> {
  const strings = (items: readonly string[], label: string): string[] => {
    if (items.length > 20) throw new Error(`${label} exceeds its storage limit.`);
    return items.map((item) => boundedText(item, label)!).filter(Boolean);
  };
  const provider = boundedText(output.provider, "provider");
  if (!provider || provider.length > 80) throw new Error("Provider identifier is invalid.");
  const model = boundedText(output.model, "model");
  if (model && model.length > 120) throw new Error("Model identifier is invalid.");
  const summary = boundedText(output.summary, "summary");
  const suggestedFollowUp = boundedText(output.suggestedFollowUp, "follow-up");
  return {
    provider,
    ...(model ? { model } : {}),
    ...(summary ? { summary } : {}),
    strengths: strings(output.strengths, "strengths"),
    gaps: strings(output.gaps, "gaps"),
    ...(suggestedFollowUp ? { suggestedFollowUp } : {}),
    questions: strings(output.questions, "questions"),
  };
}

function resolveTarget(state: JourneyState, userId: string, targetType: AIReviewTargetType, targetId: string): AIReviewRequest {
  const evidence: string[] = [];
  let title: string;
  if (targetType === "TASK") {
    const task = state.records.tasks[targetId];
    const quarter = task ? state.records.quarters[task.quarterId] : undefined;
    if (!task || quarter?.userId !== userId) throw notFound();
    const snapshot = task.planSnapshot;
    title = snapshot?.title ?? task.title;
    evidence.push(`Quarter: ${quarter.intentSnapshot?.title ?? quarter.title}.`);
    const focusAreaId = snapshot?.focusAreaId ?? task.focusAreaId;
    const focusArea = focusAreaId ? state.records.focusAreas[focusAreaId] : undefined;
    if (focusArea) evidence.push(`Focus area: ${focusArea.name}.`);
    const milestoneId = snapshot?.milestoneId ?? task.milestoneId;
    const milestone = milestoneId ? state.records.milestones[milestoneId] : undefined;
    if (milestone) evidence.push(`Week: ${milestone.intentSnapshot?.title ?? milestone.title}.`);
    evidence.push(`Current state: ${task.status.replaceAll("_", " ").toLowerCase()}.`);
    evidence.push(`Originally planned for ${snapshot?.plannedDate ?? task.plannedDate}.`);
    if (snapshot?.description ?? task.description) evidence.push(snapshot?.description ?? task.description!);
    const sessions = Object.values(state.records.sessions).filter((session) => session.taskId === task.id);
    evidence.push(`${sessions.length} recorded session${sessions.length === 1 ? "" : "s"}.`);
    const reviews = Object.values(state.records.dailyReviews).filter((review) => review.taskId === task.id);
    for (const review of reviews) {
      evidence.push(`Recorded outcome: ${review.outcome.toLowerCase().replaceAll("_", " ")}.`);
      if (review.keyLearning) evidence.push(`Recorded learning: ${review.keyLearning}`);
    }
  } else if (targetType === "WEEK") {
    const milestone = state.records.milestones[targetId];
    const quarter = milestone ? state.records.quarters[milestone.quarterId] : undefined;
    if (!milestone || quarter?.userId !== userId) throw notFound();
    title = milestone.intentSnapshot?.title ?? milestone.title;
    const start = milestone.intentSnapshot?.startDate ?? milestone.startDate;
    const end = milestone.intentSnapshot?.endDate ?? milestone.endDate;
    evidence.push(`Period: ${start} to ${end}.`);
    const tasks = Object.values(state.records.tasks).filter((task) =>
      task.quarterId === quarter.id && (task.planSnapshot?.milestoneId ?? task.milestoneId) === milestone.id,
    );
    evidence.push(`${tasks.length} planned item${tasks.length === 1 ? "" : "s"}; ${tasks.filter((task) => task.status === "FINISHED").length} finished; ${tasks.filter((task) => task.status === "IN_PROGRESS" || task.status === "PAUSED").length} still open.`);
    for (const task of tasks) evidence.push(`${task.planSnapshot?.title ?? task.title}: ${task.status.toLowerCase().replaceAll("_", " ")}.`);
    const thoughts = Object.values(state.records.journeyEntries).filter((entry) => {
      const date = localDate(entry.occurredAt, entry.timeZoneAtOccurrence);
      return entry.userId === userId && date >= start && date <= end;
    });
    evidence.push(`${thoughts.length} captured thought${thoughts.length === 1 ? "" : "s"}.`);
    for (const thought of thoughts) evidence.push(thought.text);
  } else if (targetType === "QUARTER") {
    const quarter = state.records.quarters[targetId];
    if (!quarter || quarter.userId !== userId) throw notFound();
    title = quarter.intentSnapshot?.title ?? quarter.title;
    evidence.push(`Quarter dates: ${quarter.intentSnapshot?.startDate ?? quarter.startDate} to ${quarter.intentSnapshot?.endDate ?? quarter.endDate}.`);
    const criteria = quarter.intentSnapshot?.successCriteria ?? quarter.successCriteria;
    for (const criterion of criteria) evidence.push(`Success criterion: ${criterion.text}`);
    const tasks = Object.values(state.records.tasks).filter((task) => task.quarterId === quarter.id);
    evidence.push(`${tasks.length} planned items; ${tasks.filter((task) => task.status === "FINISHED").length} finished; ${tasks.filter((task) => task.status === "IN_PROGRESS" || task.status === "PAUSED").length} still open.`);
    for (const task of tasks) evidence.push(`${task.planSnapshot?.title ?? task.title}: ${task.status.toLowerCase().replaceAll("_", " ")}.`);
    if (quarter.intentSnapshot?.description ?? quarter.description) evidence.push(quarter.intentSnapshot?.description ?? quarter.description!);
    if (quarter.intentSnapshot?.mantra ?? quarter.mantra) evidence.push(quarter.intentSnapshot?.mantra ?? quarter.mantra!);
  } else {
    const decision = state.records.decisionRecords[targetId];
    if (!decision || decision.userId !== userId) throw notFound();
    title = decision.title;
    evidence.push(`Decision status: ${decision.status.toLowerCase()}.`);
    if (decision.context) evidence.push(`Context: ${decision.context}`);
    for (const option of decision.options) {
      evidence.push(`Option: ${option.title}. ${option.description}`);
      for (const strength of option.strengths) evidence.push(`Strength: ${strength}`);
      for (const weakness of option.weaknesses) evidence.push(`Weakness: ${weakness}`);
    }
    if (decision.decision) evidence.push(`Chosen approach: ${decision.decision}`);
    if (decision.consequences) evidence.push(`Consequences: ${decision.consequences}`);
    for (const assumption of decision.assumptions) evidence.push(`Assumption: ${assumption}`);
    const reviews = Object.values(state.records.decisionReviews)
      .filter((review) => review.decisionId === decision.id)
      .sort((left, right) => left.sequence - right.sequence);
    for (const review of reviews) {
      evidence.push(`Review ${review.sequence}: ${review.outcome.toLowerCase()}.`);
      if (review.notes) evidence.push(review.notes);
    }
  }
  const boundedEvidence = evidence.slice(0, 40).map((item) => item.slice(0, 500));
  if (evidence.length > 40 || evidence.some((item) => item.length > 500)) {
    const omission = "Some saved context is omitted from this bounded local preview.";
    if (boundedEvidence.length === 40) boundedEvidence[39] = omission;
    else boundedEvidence.push(omission);
  }
  return { targetType, targetId, title, evidence: boundedEvidence };
}

function assertTargetExists(state: JourneyState, userId: string, targetType: AIReviewTargetType, targetId: string): void {
  if (targetType === "TASK") {
    const task = state.records.tasks[targetId];
    if (!task || state.records.quarters[task.quarterId]?.userId !== userId) throw notFound();
  } else if (targetType === "WEEK") {
    const milestone = state.records.milestones[targetId];
    if (!milestone || state.records.quarters[milestone.quarterId]?.userId !== userId) throw notFound();
  } else if (targetType === "QUARTER") {
    if (state.records.quarters[targetId]?.userId !== userId) throw notFound();
  } else if (state.records.decisionRecords[targetId]?.userId !== userId) throw notFound();
}

function currentReceipt(state: JourneyState, userId: string, key: string, fingerprint: string): string | undefined {
  const existing = state.commandReceipts[`${userId}:${key}`];
  if (!existing) return undefined;
  if (existing.requestFingerprint !== fingerprint) {
    throw new AppError(409, "IDEMPOTENCY_KEY_REUSED", "That action key was already used", "Use a new action key for a different review.");
  }
  const reviewId = existing.result.outcomeFacts.aiReviewId;
  if (typeof reviewId !== "string" || !state.records.aiReviews[reviewId]) {
    throw new Error("An AI review receipt points to a missing committed record.");
  }
  return reviewId;
}

export function projectAIReview(review: AIReviewRecord) {
  return {
    id: review.id,
    targetType: review.targetType,
    targetId: review.targetId,
    provider: review.provider,
    model: review.model ?? null,
    summary: review.summary ?? null,
    strengths: [...review.strengths],
    gaps: [...review.gaps],
    suggestedFollowUp: review.suggestedFollowUp ?? null,
    questions: [...review.questions],
    generatedAt: review.generatedAt,
    timeZoneAtGeneration: review.timeZoneAtGeneration,
  };
}

export class AIReviewService {
  constructor(
    private readonly store: JourneyStore,
    private readonly currentUser: CurrentUserProvider,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly reviewer: AIReviewer,
  ) {}

  async list(targetType: AIReviewTargetType, targetId: string) {
    const userId = await this.currentUser.getCurrentUserId();
    return this.store.read((state) => {
      assertTargetExists(state, userId, targetType, targetId);
      return {
        items: Object.values(state.records.aiReviews)
          .filter((review) => review.userId === userId && review.targetType === targetType && review.targetId === targetId)
          .sort((left, right) => left.generatedAt.localeCompare(right.generatedAt) || left.id.localeCompare(right.id))
          .map(projectAIReview),
      };
    });
  }

  async create(targetType: AIReviewTargetType, targetId: string, key: string, route: string) {
    const userId = await this.currentUser.getCurrentUserId();
    const fingerprint = opaqueHash({ method: "POST", route, targetType, targetId, body: {} });
    const existingId = await this.store.read((state) => currentReceipt(state, userId, key, fingerprint));
    if (existingId) {
      return { review: await this.store.read((state) => projectAIReview(state.records.aiReviews[existingId]!)), replayed: true };
    }

    const initialTarget: ReviewTarget = await this.store.read((state) => {
      const request = resolveTarget(state, userId, targetType, targetId);
      return { request, fingerprint: opaqueHash(request) };
    });
    let output: AIReviewOutput;
    try {
      output = await this.reviewer.review(initialTarget.request);
    } catch {
      throw new AppError(503, "AI_REVIEW_FAILED", "Generated advice is unavailable", "No advice was saved. Try again later.");
    }
    let normalized: ReturnType<typeof normalizeOutput>;
    try {
      normalized = normalizeOutput(output);
    } catch {
      throw new AppError(503, "AI_REVIEW_FAILED", "Generated advice is unavailable", "The review provider returned an invalid response. No advice was saved.");
    }

    const generatedAt = this.clock.now().toISOString();
    let replayed = false;
    const result = await this.store.transact(STANDARD_INTENT, (draft) => {
      const replay = currentReceipt(draft, userId, key, fingerprint);
      if (replay) {
        replayed = true;
        return { kind: "no-change" as const, value: replay };
      }
      const currentTarget = resolveTarget(draft, userId, targetType, targetId);
      if (opaqueHash(currentTarget) !== initialTarget.fingerprint) {
        throw new AppError(409, "AI_TARGET_CHANGED", "The review target changed", "Refresh its context and request a new review.");
      }
      const timeZone = draft.records.users[userId]!.timeZone;
      if (targetType === "TASK") captureTaskPlanContext(draft, draft.records.tasks[targetId]!, timeZone, generatedAt);
      else if (targetType === "WEEK") captureMilestoneContext(draft, draft.records.milestones[targetId]!, timeZone, generatedAt);
      else if (targetType === "QUARTER") captureQuarterContext(draft, targetId, timeZone, generatedAt);
      else {
        const decision = draft.records.decisionRecords[targetId]!;
        if (decision.relatedTaskId) {
          const task = draft.records.tasks[decision.relatedTaskId]!;
          captureTaskPlanContext(draft, task, timeZone, generatedAt);
        } else if (decision.quarterId) captureQuarterContext(draft, decision.quarterId, timeZone, generatedAt);
      }
      const id = this.ids.generate();
      const record: AIReviewRecord = {
        id,
        userId,
        targetType,
        targetId,
        ...normalized,
        generatedAt,
        timeZoneAtGeneration: timeZone,
      };
      draft.records.aiReviews[id] = record;
      draft.commandReceipts[`${userId}:${key}`] = {
        userId,
        key,
        method: "POST",
        route,
        requestFingerprint: fingerprint,
        result: { outcomeKind: "CREATE_AI_REVIEW", createdRecordIds: [id], affectedRecordIds: [targetId], outcomeFacts: { aiReviewId: id } },
        committedStoreRevision: draft.storeRevision + 1,
        createdAt: generatedAt,
      };
      return { kind: "changed" as const, value: id };
    });
    return { review: projectAIReview(result.state.records.aiReviews[result.value]!), replayed };
  }
}
