import type { DecisionRecord, DecisionReviewRecord, JourneyState } from "../../domain/journey-state.js";
import { AppError } from "../app-error.js";
import { opaqueHash } from "../task-etag.js";

export function orderedDecisionReviews(state: JourneyState, decisionId: string): DecisionReviewRecord[] {
  return Object.values(state.records.decisionReviews)
    .filter((review) => review.decisionId === decisionId)
    .sort((left, right) => left.sequence - right.sequence);
}

export function indexLatestDecisionReviews(state: JourneyState): Map<string, DecisionReviewRecord> {
  const latest = new Map<string, DecisionReviewRecord>();
  for (const review of Object.values(state.records.decisionReviews)) {
    const current = latest.get(review.decisionId);
    if (!current || review.sequence > current.sequence) latest.set(review.decisionId, review);
  }
  return latest;
}

function dueDateFromLatest(decision: DecisionRecord, latest: DecisionReviewRecord | undefined): string | null {
  if (decision.status !== "ACCEPTED") return null;
  return latest ? latest.nextReviewDate ?? null : decision.initialReviewDate ?? null;
}

export function currentDecisionDueDate(
  state: JourneyState,
  decision: DecisionRecord,
  latestByDecision?: ReadonlyMap<string, DecisionReviewRecord>,
): string | null {
  return dueDateFromLatest(
    decision,
    latestByDecision?.get(decision.id) ?? (latestByDecision ? undefined : orderedDecisionReviews(state, decision.id).at(-1)),
  );
}

export function decisionEtag(state: JourneyState, decision: DecisionRecord): string {
  const reviews = orderedDecisionReviews(state, decision.id);
  return `"decision-${opaqueHash([decision, reviews, dueDateFromLatest(decision, reviews.at(-1))])}"`;
}

function titleForTask(state: JourneyState, taskId: string | undefined): string | null {
  if (!taskId) return null;
  const task = state.records.tasks[taskId];
  return task ? task.planSnapshot?.title ?? task.title : null;
}

function relation(state: JourneyState, id: string | undefined) {
  if (!id) return null;
  const decision = state.records.decisionRecords[id];
  return decision ? { id: decision.id, title: decision.title } : null;
}

export function projectDecisionSummary(
  state: JourneyState,
  decision: DecisionRecord,
  latestByDecision?: ReadonlyMap<string, DecisionReviewRecord>,
) {
  const taskTitle = titleForTask(state, decision.relatedTaskId);
  return {
    id: decision.id,
    title: decision.title,
    status: decision.status,
    decisionDate: decision.decisionDate ?? null,
    quarterId: decision.quarterId ?? null,
    relatedTask: decision.relatedTaskId && taskTitle ? { id: decision.relatedTaskId, title: taskTitle } : null,
    supersedesDecisionId: decision.supersedesDecisionId ?? null,
    currentDueDate: currentDecisionDueDate(state, decision, latestByDecision),
    updatedAt: decision.updatedAt,
    href: `/api/decisions/${decision.id}`,
  };
}

export function projectDecisionDetail(state: JourneyState, decision: DecisionRecord) {
  const taskTitle = titleForTask(state, decision.relatedTaskId);
  return {
    id: decision.id,
    etag: decisionEtag(state, decision),
    userId: decision.userId,
    title: decision.title,
    decisionDate: decision.decisionDate ?? null,
    status: decision.status,
    quarterId: decision.quarterId ?? null,
    relatedTask: decision.relatedTaskId && taskTitle ? { id: decision.relatedTaskId, title: taskTitle } : null,
    supersedesDecision: relation(state, decision.supersedesDecisionId),
    context: decision.context ?? null,
    constraints: [...decision.constraints],
    options: structuredClone(decision.options),
    decision: decision.decision ?? null,
    consequences: decision.consequences ?? null,
    assumptions: [...decision.assumptions],
    falsifier: decision.falsifier ?? null,
    initialReviewDate: decision.initialReviewDate ?? null,
    currentDueDate: currentDecisionDueDate(state, decision),
    reviews: orderedDecisionReviews(state, decision.id).map((review) => ({
      id: review.id,
      sequence: review.sequence,
      reviewedAt: review.reviewedAt,
      timeZoneAtReview: review.timeZoneAtReview,
      outcome: review.outcome,
      notes: review.notes ?? null,
      nextReviewDate: review.nextReviewDate ?? null,
      replacementDecision: relation(state, review.replacementDecisionId),
    })),
    createdAt: decision.createdAt,
    updatedAt: decision.updatedAt,
  };
}

interface DecisionCursor { value: string; id: string; due: boolean }
function decodeCursor(cursor: string | undefined): DecisionCursor | null {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as DecisionCursor;
    if (!value || typeof value.value !== "string" || typeof value.id !== "string" || typeof value.due !== "boolean") throw new Error("invalid");
    return value;
  } catch {
    throw new AppError(422, "VALIDATION_FAILED", "The cursor is not valid", "Refresh the list and try again.");
  }
}

export function projectDecisionList(state: JourneyState, userId: string, input: {
  quarterId?: string; status?: DecisionRecord["status"]; due?: boolean; cursor?: string; limit: number; today: string;
}) {
  const dueMode = input.due === true;
  const latestByDecision = indexLatestDecisionReviews(state);
  const dueDate = (decision: DecisionRecord) => currentDecisionDueDate(state, decision, latestByDecision);
  let decisions = Object.values(state.records.decisionRecords).filter((decision) =>
    decision.userId === userId &&
    (!input.quarterId || decision.quarterId === input.quarterId) &&
    (!input.status || decision.status === input.status) &&
    (!dueMode || (dueDate(decision) ?? "9999-99-99") <= input.today),
  );
  decisions.sort((left, right) => {
    if (dueMode) {
      const leftDue = dueDate(left)!;
      const rightDue = dueDate(right)!;
      return leftDue.localeCompare(rightDue) || left.id.localeCompare(right.id);
    }
    return right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id);
  });
  const cursor = decodeCursor(input.cursor);
  if (cursor) {
    if (cursor.due !== dueMode) throw new AppError(422, "VALIDATION_FAILED", "The cursor is not valid", "Refresh the list and try again.");
    decisions = decisions.filter((decision) => {
      const value = dueMode ? dueDate(decision)! : decision.updatedAt;
      return dueMode
        ? value > cursor.value || value === cursor.value && decision.id > cursor.id
        : value < cursor.value || value === cursor.value && decision.id < cursor.id;
    });
  }
  const page = decisions.slice(0, input.limit);
  const last = page.at(-1);
  return {
    items: page.map((decision) => projectDecisionSummary(state, decision, latestByDecision)),
    nextCursor: last && page.length < decisions.length
      ? Buffer.from(JSON.stringify({ value: dueMode ? dueDate(last)! : last.updatedAt, id: last.id, due: dueMode }), "utf8").toString("base64url")
      : null,
  };
}
