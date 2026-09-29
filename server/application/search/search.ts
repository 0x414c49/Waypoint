import type { SearchContentType, SearchGroupType, SearchResultContract } from "../../../shared/contracts/search.js";
import type { JourneyState } from "../../domain/journey-state.js";
import { AppError } from "../app-error.js";
import { opaqueHash } from "../task-etag.js";

interface SearchHit {
  readonly group: SearchGroupType;
  readonly result: SearchResultContract;
  readonly score: number;
  readonly tieBreak: string;
}

interface SearchInput {
  readonly query: string;
  readonly type?: SearchGroupType;
  readonly quarterId?: string;
  readonly cursor?: string;
  readonly limit: number;
}

function normalize(value: string): string {
  return value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase();
}

function excerpt(value: string, query: string): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= 220) return clean;
  const index = normalize(clean).indexOf(normalize(query));
  const start = Math.max(0, Math.min(clean.length - 220, index - 70));
  return `${start > 0 ? "…" : ""}${clean.slice(start, start + 220)}${start + 220 < clean.length ? "…" : ""}`;
}

function matchScore(fields: readonly string[], title: string, query: string): { score: number; excerpt: string } | null {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return null;
  let bestScore = Number.POSITIVE_INFINITY;
  let bestExcerpt = "";
  for (const field of fields) {
    const normalizedField = normalize(field);
    const index = normalizedField.indexOf(normalizedQuery);
    if (index < 0) continue;
    const titleMatch = normalize(title).includes(normalizedQuery);
    const score = normalizedField === normalizedQuery ? 0
      : normalize(title) === normalizedQuery ? 1
        : titleMatch ? 2
          : index === 0 ? 3
            : 4;
    if (score < bestScore) {
      bestScore = score;
      bestExcerpt = excerpt(field, query);
    }
  }
  return Number.isFinite(bestScore) ? { score: bestScore, excerpt: bestExcerpt } : null;
}

function makeHit(
  group: SearchGroupType,
  contentType: SearchContentType,
  id: string,
  title: string,
  fields: readonly string[],
  query: string,
  context: Partial<Pick<SearchResultContract, "quarterId" | "focusAreaId" | "milestoneId" | "taskId" | "journeyEntryId" | "decisionId" | "occurredAt">> = {},
): SearchHit | undefined {
  const match = matchScore(fields, title, query);
  if (!match) return undefined;
  return {
    group,
    score: match.score,
    tieBreak: `${title.toLocaleLowerCase()}\u0000${id}`,
    result: {
      contentType,
      id,
      title,
      excerpt: match.excerpt,
      quarterId: context.quarterId ?? null,
      focusAreaId: context.focusAreaId ?? null,
      milestoneId: context.milestoneId ?? null,
      taskId: context.taskId ?? null,
      journeyEntryId: context.journeyEntryId ?? null,
      decisionId: context.decisionId ?? null,
      occurredAt: context.occurredAt ?? null,
    },
  };
}

function cursorOffset(cursor: string | undefined, fingerprint: string): number {
  if (!cursor) return 0;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { offset?: unknown; fingerprint?: unknown };
    if (!Number.isSafeInteger(value.offset) || (value.offset as number) < 0 || value.fingerprint !== fingerprint) throw new Error("invalid");
    return value.offset as number;
  } catch {
    throw new AppError(422, "VALIDATION_FAILED", "The search cursor is not valid", "Search again to refresh these results.");
  }
}

export function searchRecords(state: JourneyState, userId: string, input: SearchInput) {
  const query = input.query.trim();
  if (!query) throw new AppError(422, "VALIDATION_FAILED", "Enter a search term", "Use at least one non-space character.");
  const filterFingerprint = opaqueHash({ query: normalize(query), type: input.type ?? null, quarterId: input.quarterId ?? null });
  const hits: SearchHit[] = [];
  const push = (hit: SearchHit | undefined) => { if (hit) hits.push(hit); };
  const include = (group: SearchGroupType, quarterId?: string) =>
    (!input.type || input.type === group) && (!input.quarterId || quarterId === input.quarterId);

  for (const quarter of Object.values(state.records.quarters)) {
    if (quarter.userId !== userId || !include("PLAN", quarter.id)) continue;
    const historicalTitle = quarter.intentSnapshot?.title;
    push(makeHit("PLAN", "QUARTER", quarter.id, quarter.title,
      [quarter.title, historicalTitle ?? "", quarter.description ?? "", quarter.mantra ?? "", ...quarter.successCriteria.map((item) => item.text), ...(quarter.intentSnapshot?.successCriteria.map((item) => item.text) ?? [])],
      query, { quarterId: quarter.id }));
  }

  for (const area of Object.values(state.records.focusAreas)) {
    const quarter = state.records.quarters[area.quarterId];
    if (!quarter || quarter.userId !== userId || !include("PLAN", quarter.id)) continue;
    push(makeHit("PLAN", "FOCUS_AREA", area.id, area.name, [area.name, area.description ?? ""], query,
      { quarterId: quarter.id, focusAreaId: area.id }));
  }

  for (const milestone of Object.values(state.records.milestones)) {
    const quarter = state.records.quarters[milestone.quarterId];
    if (!quarter || quarter.userId !== userId || !include("PLAN", quarter.id)) continue;
    push(makeHit("PLAN", "MILESTONE", milestone.id, milestone.title,
      [milestone.title, milestone.intentSnapshot?.title ?? "", milestone.description ?? "", milestone.intentSnapshot?.description ?? ""],
      query, { quarterId: quarter.id, milestoneId: milestone.id }));
  }

  for (const task of Object.values(state.records.tasks)) {
    const quarter = state.records.quarters[task.quarterId];
    if (!quarter || quarter.userId !== userId || !include("PLAN", quarter.id)) continue;
    const focusAreaId = task.planSnapshot?.focusAreaId ?? task.focusAreaId;
    const milestoneId = task.planSnapshot?.milestoneId ?? task.milestoneId;
    push(makeHit("PLAN", "TASK", task.id, task.planSnapshot?.title ?? task.title,
      [task.title, task.description ?? "", ...task.tags, task.planSnapshot?.title ?? "", task.planSnapshot?.description ?? "", ...(task.planSnapshot?.tags ?? [])],
      query, { quarterId: quarter.id, taskId: task.id, focusAreaId: focusAreaId ?? null, milestoneId: milestoneId ?? null }));
  }

  for (const entry of Object.values(state.records.journeyEntries)) {
    const task = entry.relatedTaskId ? state.records.tasks[entry.relatedTaskId] : undefined;
    const milestone = entry.relatedMilestoneId ? state.records.milestones[entry.relatedMilestoneId] : undefined;
    const decision = entry.relatedDecisionId ? state.records.decisionRecords[entry.relatedDecisionId] : undefined;
    const quarterId = task?.quarterId ?? milestone?.quarterId ?? decision?.quarterId;
    if (entry.userId !== userId || !include("JOURNEY", quarterId)) continue;
    push(makeHit("JOURNEY", "THOUGHT", entry.id, task?.planSnapshot?.title ?? task?.title ?? milestone?.intentSnapshot?.title ?? milestone?.title ?? "Thought",
      [entry.text, ...entry.tags, task?.planSnapshot?.title ?? task?.title ?? "", milestone?.intentSnapshot?.title ?? milestone?.title ?? "", decision?.title ?? ""],
      query, {
        quarterId: task?.quarterId ?? milestone?.quarterId ?? decision?.quarterId ?? null,
        taskId: task?.id ?? null,
        milestoneId: milestone?.id ?? null,
        journeyEntryId: entry.id,
        decisionId: decision?.id ?? null,
        occurredAt: entry.occurredAt,
      }));
  }

  for (const decision of Object.values(state.records.decisionRecords)) {
    const relatedTask = decision.relatedTaskId ? state.records.tasks[decision.relatedTaskId] : undefined;
    if (decision.userId !== userId || !include("DECISION", decision.quarterId ?? relatedTask?.quarterId)) continue;
    const reviews = Object.values(state.records.decisionReviews).filter((review) => review.decisionId === decision.id);
    push(makeHit("DECISION", "DECISION", decision.id, decision.title,
      [decision.title, decision.context ?? "", decision.decision ?? "", decision.consequences ?? "", decision.falsifier ?? "", ...decision.constraints, ...decision.assumptions, ...decision.options.flatMap((option) => [option.title, option.description, ...option.strengths, ...option.weaknesses]), ...reviews.flatMap((review) => [review.outcome, review.notes ?? "", review.nextReviewDate ?? ""])],
      query, { quarterId: decision.quarterId ?? relatedTask?.quarterId ?? null, taskId: relatedTask?.id ?? null, decisionId: decision.id }));
  }

  hits.sort((left, right) => left.score - right.score || left.tieBreak.localeCompare(right.tieBreak) || left.group.localeCompare(right.group));
  const offset = cursorOffset(input.cursor, filterFingerprint);
  const page = hits.slice(offset, offset + input.limit);
  const groups: Array<{ type: SearchGroupType; items: SearchResultContract[] }> = [];
  for (const hit of page) {
    let group = groups.find((item) => item.type === hit.group);
    if (!group) {
      group = { type: hit.group, items: [] };
      groups.push(group);
    }
    group.items.push(hit.result);
  }
  const groupOrder: Record<SearchGroupType, number> = { PLAN: 0, JOURNEY: 1, DECISION: 2 };
  groups.sort((left, right) => groupOrder[left.type] - groupOrder[right.type]);
  const nextOffset = offset + page.length;
  return {
    query,
    groups,
    nextCursor: nextOffset < hits.length
      ? Buffer.from(JSON.stringify({ offset: nextOffset, fingerprint: filterFingerprint }), "utf8").toString("base64url")
      : null,
  };
}
