// FTS5 document composer for the SQLite store (ADR-0014).
// One function composes (title, body, user_id, quarter_id, group_type,
// content_type, occurred_at) per source row. The store calls it on live
// writes; the Phase-2 JSON -> SQLite importer reuses composeAllFtsDocs.
// FTS is a candidate prefilter only: searchRecords (TypeScript) stays the
// authoritative scorer and owns ranking, excerpts, and cursors.
// Bodies mirror the field sets in server/application/search/search.ts so the
// prefilter is a superset of what the scorer can match.

import type { JourneyState } from "../../domain/journey-state.js";

export type FtsGroupType = "PLAN" | "JOURNEY" | "DECISION";

export type FtsContentType =
  | "QUARTER"
  | "FOCUS_AREA"
  | "MILESTONE"
  | "TASK"
  | "THOUGHT"
  | "DECISION";

export interface FtsDoc {
  readonly docId: string;
  readonly userId: string;
  readonly quarterId: string | null;
  readonly groupType: FtsGroupType;
  readonly contentType: FtsContentType;
  readonly occurredAt: string | null;
  readonly title: string;
  readonly body: string;
}

export type FtsCollection =
  | "quarters"
  | "focusAreas"
  | "milestones"
  | "tasks"
  | "journeyEntries"
  | "decisionRecords"
  | "decisionReviews";

function joinFields(fields: readonly (string | undefined)[]): string {
  return fields.filter((field): field is string => !!field && field.trim().length > 0).join("\n");
}

function composeQuarter(state: JourneyState, id: string): FtsDoc | undefined {
  const quarter = state.records.quarters[id];
  if (!quarter) return undefined;
  return {
    docId: `quarter:${id}`,
    userId: quarter.userId,
    quarterId: quarter.id,
    groupType: "PLAN",
    contentType: "QUARTER",
    occurredAt: null,
    title: quarter.title,
    body: joinFields([
      quarter.title,
      quarter.intentSnapshot?.title,
      quarter.description,
      quarter.mantra,
      ...quarter.successCriteria.map((item) => item.text),
      ...(quarter.intentSnapshot?.successCriteria.map((item) => item.text) ?? []),
    ]),
  };
}

function composeFocusArea(state: JourneyState, id: string): FtsDoc | undefined {
  const area = state.records.focusAreas[id];
  if (!area) return undefined;
  const quarter = state.records.quarters[area.quarterId];
  if (!quarter) return undefined;
  return {
    docId: `focus-area:${id}`,
    userId: quarter.userId,
    quarterId: quarter.id,
    groupType: "PLAN",
    contentType: "FOCUS_AREA",
    occurredAt: null,
    title: area.name,
    body: joinFields([area.name, area.description]),
  };
}

function composeMilestone(state: JourneyState, id: string): FtsDoc | undefined {
  const milestone = state.records.milestones[id];
  if (!milestone) return undefined;
  const quarter = state.records.quarters[milestone.quarterId];
  if (!quarter) return undefined;
  return {
    docId: `milestone:${id}`,
    userId: quarter.userId,
    quarterId: quarter.id,
    groupType: "PLAN",
    contentType: "MILESTONE",
    occurredAt: null,
    title: milestone.title,
    body: joinFields([
      milestone.title,
      milestone.intentSnapshot?.title,
      milestone.description,
      milestone.intentSnapshot?.description,
    ]),
  };
}

function composeTask(state: JourneyState, id: string): FtsDoc | undefined {
  const task = state.records.tasks[id];
  if (!task) return undefined;
  const quarter = state.records.quarters[task.quarterId];
  if (!quarter) return undefined;
  return {
    docId: `task:${id}`,
    userId: quarter.userId,
    quarterId: quarter.id,
    groupType: "PLAN",
    contentType: "TASK",
    occurredAt: null,
    title: task.planSnapshot?.title ?? task.title,
    body: joinFields([
      task.title,
      task.description,
      ...task.tags,
      task.planSnapshot?.title,
      task.planSnapshot?.description,
      ...(task.planSnapshot?.tags ?? []),
    ]),
  };
}

function composeJourneyEntry(state: JourneyState, id: string): FtsDoc | undefined {
  const entry = state.records.journeyEntries[id];
  if (!entry) return undefined;
  const task = entry.relatedTaskId ? state.records.tasks[entry.relatedTaskId] : undefined;
  const milestone = entry.relatedMilestoneId ? state.records.milestones[entry.relatedMilestoneId] : undefined;
  const decision = entry.relatedDecisionId ? state.records.decisionRecords[entry.relatedDecisionId] : undefined;
  return {
    docId: `journey:${id}`,
    userId: entry.userId,
    quarterId: task?.quarterId ?? milestone?.quarterId ?? decision?.quarterId ?? null,
    groupType: "JOURNEY",
    contentType: "THOUGHT",
    occurredAt: entry.occurredAt,
    title:
      task?.planSnapshot?.title ??
      task?.title ??
      milestone?.intentSnapshot?.title ??
      milestone?.title ??
      "Thought",
    body: joinFields([
      entry.text,
      ...entry.tags,
      task?.planSnapshot?.title,
      task?.title,
      milestone?.intentSnapshot?.title,
      milestone?.title,
      decision?.title,
    ]),
  };
}

function composeDecision(state: JourneyState, id: string): FtsDoc | undefined {
  const decision = state.records.decisionRecords[id];
  if (!decision) return undefined;
  const relatedTask = decision.relatedTaskId ? state.records.tasks[decision.relatedTaskId] : undefined;
  const reviews = Object.values(state.records.decisionReviews).filter((review) => review.decisionId === decision.id);
  return {
    docId: `decision:${id}`,
    userId: decision.userId,
    quarterId: decision.quarterId ?? relatedTask?.quarterId ?? null,
    groupType: "DECISION",
    contentType: "DECISION",
    occurredAt: null,
    title: decision.title,
    body: joinFields([
      decision.title,
      decision.context,
      decision.decision,
      decision.consequences,
      decision.falsifier,
      ...decision.constraints,
      ...decision.assumptions,
      ...decision.options.flatMap((option) => [
        option.title,
        option.description,
        ...option.strengths,
        ...option.weaknesses,
      ]),
      ...reviews.flatMap((review) => [review.outcome, review.notes, review.nextReviewDate]),
    ]),
  };
}

/** Compose the FTS doc for one source record. Undefined when the record is absent (deleted). */
export function composeFtsDocForRecord(
  state: JourneyState,
  collection: FtsCollection,
  id: string,
): FtsDoc | undefined {
  switch (collection) {
    case "quarters":
      return composeQuarter(state, id);
    case "focusAreas":
      return composeFocusArea(state, id);
    case "milestones":
      return composeMilestone(state, id);
    case "tasks":
      return composeTask(state, id);
    case "journeyEntries":
      return composeJourneyEntry(state, id);
    case "decisionRecords":
    case "decisionReviews":
      return composeDecision(
        state,
        collection === "decisionRecords" ? id : (state.records.decisionReviews[id]?.decisionId ?? id),
      );
  }
}

/** Compose every FTS doc in the state. Used for full rebuilds (Phase-2 importer, verification). */
export function composeAllFtsDocs(state: JourneyState): FtsDoc[] {
  const docs: FtsDoc[] = [];
  const push = (doc: FtsDoc | undefined): void => {
    if (doc) docs.push(doc);
  };
  for (const id of Object.keys(state.records.quarters)) push(composeQuarter(state, id));
  for (const id of Object.keys(state.records.focusAreas)) push(composeFocusArea(state, id));
  for (const id of Object.keys(state.records.milestones)) push(composeMilestone(state, id));
  for (const id of Object.keys(state.records.tasks)) push(composeTask(state, id));
  for (const id of Object.keys(state.records.journeyEntries)) push(composeJourneyEntry(state, id));
  for (const id of Object.keys(state.records.decisionRecords)) push(composeDecision(state, id));
  return docs;
}

export type ChangedIds = ReadonlyMap<FtsCollection, ReadonlySet<string>>;

/**
 * Doc ids whose FTS rows must be deleted + reinserted after a commit.
 * Covers directly touched records plus fan-out: a task/milestone/decision
 * title change alters the journey docs that quote it, and a review change
 * alters its parent decision doc (reviews are folded into the decision body,
 * so a review id maps to its decision's doc id).
 */
export function collectAffectedFtsDocIds(
  before: JourneyState,
  after: JourneyState,
  changed: ChangedIds,
): Set<string> {
  const affected = new Set<string>();
  const idOf = (collection: FtsCollection, id: string): string | null => {
    switch (collection) {
      case "quarters":
        return `quarter:${id}`;
      case "focusAreas":
        return `focus-area:${id}`;
      case "milestones":
        return `milestone:${id}`;
      case "tasks":
        return `task:${id}`;
      case "journeyEntries":
        return `journey:${id}`;
      case "decisionRecords":
        return `decision:${id}`;
      case "decisionReviews": {
        const review = after.records.decisionReviews[id] ?? before.records.decisionReviews[id];
        return review ? `decision:${review.decisionId}` : null;
      }
    }
  };
  for (const [collection, ids] of changed) {
    for (const id of ids) {
      const docId = idOf(collection, id);
      if (docId) affected.add(docId);
    }
  }

  const changedTasks = changed.get("tasks") ?? new Set<string>();
  const changedMilestones = changed.get("milestones") ?? new Set<string>();
  const changedDecisions = changed.get("decisionRecords") ?? new Set<string>();
  if (changedTasks.size > 0 || changedMilestones.size > 0 || changedDecisions.size > 0) {
    const entries = new Map<string, { relatedTaskId?: string; relatedMilestoneId?: string; relatedDecisionId?: string }>();
    for (const entry of Object.values(before.records.journeyEntries)) entries.set(entry.id, entry);
    for (const entry of Object.values(after.records.journeyEntries)) entries.set(entry.id, entry);
    for (const [entryId, entry] of entries) {
      if (
        (entry.relatedTaskId !== undefined && changedTasks.has(entry.relatedTaskId)) ||
        (entry.relatedMilestoneId !== undefined && changedMilestones.has(entry.relatedMilestoneId)) ||
        (entry.relatedDecisionId !== undefined && changedDecisions.has(entry.relatedDecisionId))
      ) {
        affected.add(`journey:${entryId}`);
      }
    }
  }
  return affected;
}
