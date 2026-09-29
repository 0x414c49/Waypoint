import { stringify } from "yaml";
import type {
  CommandReceipt,
  FocusAreaRecord,
  JourneyState,
  MilestoneRecord,
  QuarterRecord,
  TaskRecord,
} from "../../domain/journey-state.js";
import { PlanValidationError, parseAndNormalizePlanYaml, type NormalizedPlan } from "../../domain/plan.js";
import type { CurrentUserProvider } from "../../adapters/local-current-user-provider.js";
import type { Clock } from "../../ports/clock.js";
import type { IdGenerator } from "../../ports/id-generator.js";
import type { JourneyStore } from "../../ports/journey-store.js";
import { AppError, notFound } from "../app-error.js";
import { opaqueHash } from "../task-etag.js";
import { projectQuarterDetail, quarterEtag } from "../quarters/quarter-projection.js";

type ChangeKind = "ADDED" | "CHANGED" | "REMOVED" | "HISTORICAL_PRESERVED" | "CONFLICT";
type ChangeOperation = "ADD" | "UPDATE" | "REMOVE";
type EntityType = "QUARTER" | "FOCUS_AREA" | "MILESTONE" | "TASK";
type PlanChange = {
  kind: ChangeKind;
  operation: ChangeOperation;
  entityType: EntityType;
  id: string;
  label: string;
  explanation: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  historyPreserved: boolean;
};
type Acknowledgement = { id: string; code: "CONFIRM_PLAN_REMOVAL" | "PRESERVE_ACTIVE_WORK"; description: string };
type PreviewMode = "CREATE_QUARTER" | "UPDATE_QUARTER";
type PreviewRecord = {
  userId: string;
  plan: NormalizedPlan;
  mode: PreviewMode;
  quarterId: string;
  basePlanRevision: number | null;
  baseEtag: string | null;
  expiresAt: string;
  changes: PlanChange[];
  acknowledgements: Acknowledgement[];
};

const PREVIEW_LIFETIME_MS = 30 * 60 * 1000;
const route = "/api/plans/apply";

function failValidation(errors: readonly string[]): never {
  throw new AppError(422, "VALIDATION_FAILED", "The plan is not valid", "Correct the plan and preview it again.", { errors });
}

function removeUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== undefined)) as T;
}

function currentPlan(state: JourneyState, quarter: QuarterRecord): NormalizedPlan {
  return {
    version: 1,
    quarter: {
      id: quarter.id,
      title: quarter.title,
      ...(quarter.description ? { description: quarter.description } : {}),
      ...(quarter.mantra ? { mantra: quarter.mantra } : {}),
      start: quarter.startDate,
      end: quarter.endDate,
      successCriteria: [...quarter.successCriteria]
        .sort((left, right) => left.position - right.position)
        .map(({ id, text }) => ({ id, text })),
    },
    focusAreas: Object.values(state.records.focusAreas)
      .filter((area) => area.quarterId === quarter.id && !area.removedFromPlanAt)
      .sort((left, right) => left.position - right.position)
      .map(({ id, name, description, targetMinutes }) => ({ id, name, ...(description ? { description } : {}), ...(targetMinutes ? { targetMinutes } : {}) })),
    milestones: Object.values(state.records.milestones)
      .filter((milestone) => milestone.quarterId === quarter.id && !milestone.removedFromPlanAt)
      .sort((left, right) => left.position - right.position)
      .map(({ id, title, description, startDate, endDate, mode }) => ({ id, title, ...(description ? { description } : {}), start: startDate, end: endDate, mode })),
    tasks: Object.values(state.records.tasks)
      .filter((task) => task.quarterId === quarter.id && !task.removedFromPlanAt)
      .sort((left, right) => left.position - right.position)
      .map(({ id, milestoneId, focusAreaId, plannedDate, title, description, plannedMinutes, tags, recommendationMode, decisionPrompt }) => removeUndefined({
        id, milestoneId, focusAreaId, date: plannedDate, title, description, plannedMinutes, tags,
        recommendationMode, decisionPrompt,
      })) as NormalizedPlan["tasks"],
  };
}

function hasTaskHistory(state: JourneyState, task: TaskRecord): boolean {
  return Boolean(task.planSnapshot || task.status !== "NOT_STARTED" ||
    Object.values(state.records.sessions).some((record) => record.taskId === task.id) ||
    Object.values(state.records.taskLifecycleEvents).some((record) => record.taskId === task.id) ||
    Object.values(state.records.dailyReviews).some((record) => record.taskId === task.id) ||
    Object.values(state.records.journeyEntries).some((record) => record.relatedTaskId === task.id) ||
    Object.values(state.records.decisionRecords).some((record) => record.relatedTaskId === task.id) ||
    Object.values(state.records.aiReviews).some((record) => { const review = record as { targetType?: unknown; targetId?: unknown }; return review.targetType === "TASK" && review.targetId === task.id; }) ||
    Boolean(task.continuationOfTaskId) || Object.values(state.records.tasks).some((record) => record.continuationOfTaskId === task.id));
}

function hasMilestoneHistory(state: JourneyState, milestone: MilestoneRecord, plan: NormalizedPlan): boolean {
  return Boolean(milestone.intentSnapshot ||
    Object.values(state.records.tasks).some((task) => {
      if (task.planSnapshot?.milestoneId === milestone.id) return true;
      const incoming = plan.tasks.find((item) => item.id === task.id);
      if (incoming) return incoming.milestoneId === milestone.id;
      return task.milestoneId === milestone.id && !canDeleteTask(state, task);
    }) ||
    Object.values(state.records.journeyEntries).some((entry) => entry.relatedMilestoneId === milestone.id) ||
    Object.values(state.records.aiReviews).some((record) => { const review = record as { targetType?: unknown; targetId?: unknown }; return review.targetType === "WEEK" && review.targetId === milestone.id; }));
}

function hasFocusAreaHistory(state: JourneyState, focusArea: FocusAreaRecord, plan: NormalizedPlan): boolean {
  return Object.values(state.records.tasks).some((task) => {
    if (task.planSnapshot?.focusAreaId === focusArea.id) return true;
    const incoming = plan.tasks.find((item) => item.id === task.id);
    if (incoming) return incoming.focusAreaId === focusArea.id;
    return task.focusAreaId === focusArea.id && !canDeleteTask(state, task);
  });
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function isEqual(left: unknown, right: unknown): boolean {
  return stable(left) === stable(right);
}

function summarizeDiff(state: JourneyState, userId: string, plan: NormalizedPlan): { changes: PlanChange[]; acknowledgements: Acknowledgement[] } {
  const existingQuarter = state.records.quarters[plan.quarter.id];
  const changes: PlanChange[] = [];
  const acknowledgements: Acknowledgement[] = [];
  const addAck = (id: string, code: Acknowledgement["code"], description: string) => {
    if (!acknowledgements.some((item) => item.id === id)) acknowledgements.push({ id, code, description });
  };
  const push = (input: {
    type: EntityType; id: string; operation: ChangeOperation; kind: ChangeKind; label: string;
    explanation: string; before?: Record<string, unknown>; after?: Record<string, unknown>; history: boolean;
  }) => {
    const change: PlanChange = {
      kind: input.kind, operation: input.operation, entityType: input.type, id: input.id,
      label: input.label, explanation: input.explanation, historyPreserved: input.history,
      ...(input.before ? { before: input.before } : {}), ...(input.after ? { after: input.after } : {}),
    };
    changes.push(change);
    if (input.operation === "REMOVE") {
      addAck(`confirm-removal:${input.type.toLowerCase()}:${input.id}`, "CONFIRM_PLAN_REMOVAL", `Confirm removing ${input.label} from the current plan. Any existing learning history will be kept.`);
    }
    if (input.type === "TASK" && input.before && (input.before.status === "IN_PROGRESS" || input.before.status === "PAUSED") && (input.operation === "REMOVE" || input.operation === "UPDATE")) {
      addAck(`preserve-active:${input.id}`, "PRESERVE_ACTIVE_WORK", `Keep the current ${input.before.status === "IN_PROGRESS" ? "running" : "paused"} work and its Sessions unchanged while applying this plan change.`);
    }
  };

  const quarterAfter = removeUndefined({
    id: plan.quarter.id, title: plan.quarter.title, description: plan.quarter.description,
    mantra: plan.quarter.mantra, start: plan.quarter.start, end: plan.quarter.end,
    successCriteria: plan.quarter.successCriteria,
  });
  if (!existingQuarter) {
    push({ type: "QUARTER", id: plan.quarter.id, operation: "ADD", kind: "ADDED", label: plan.quarter.title, explanation: "This creates a new Quarter. Imported Tasks begin Not started; no learning history is created.", after: quarterAfter, history: false });
  } else {
    if (existingQuarter.userId !== userId) throw notFound();
    const quarterBefore = removeUndefined({
      id: existingQuarter.id, title: existingQuarter.title, description: existingQuarter.description,
      mantra: existingQuarter.mantra, start: existingQuarter.startDate, end: existingQuarter.endDate,
      successCriteria: [...existingQuarter.successCriteria].sort((a, b) => a.position - b.position).map(({ id, text }) => ({ id, text })),
    });
    if (!isEqual(quarterBefore, quarterAfter)) {
      push({ type: "QUARTER", id: existingQuarter.id, operation: "UPDATE", kind: existingQuarter.intentSnapshot ? "HISTORICAL_PRESERVED" : "CHANGED", label: existingQuarter.title,
        explanation: existingQuarter.intentSnapshot ? "Current Quarter intent changes; the original quarter context captured by learning history remains unchanged." : "Only current Quarter intent changes.", before: quarterBefore, after: quarterAfter, history: Boolean(existingQuarter.intentSnapshot) });
    }
    const incomingCriterionIds = new Set(plan.quarter.successCriteria.map((criterion) => criterion.id));
    for (const criterion of existingQuarter.successCriteria) {
      if (!incomingCriterionIds.has(criterion.id)) {
        addAck(`confirm-removal:criterion:${criterion.id}`, "CONFIRM_PLAN_REMOVAL", `Confirm removing success criterion “${criterion.text}” from the Quarter plan.`);
      }
    }
  }

  // Group and Task diffs are deliberately rendered from the same persisted plan fields that Apply writes.
  const incomingAreas = new Map(plan.focusAreas.map((item, position) => [item.id, { ...item, position }]));
  const existingAreas = Object.values(state.records.focusAreas).filter((area) => area.quarterId === plan.quarter.id);
  for (const area of existingAreas) {
    const wanted = incomingAreas.get(area.id);
    const before = removeUndefined({ id: area.id, name: area.name, description: area.description, targetMinutes: area.targetMinutes });
    if (!wanted) {
      if (area.removedFromPlanAt) continue;
      const history = hasFocusAreaHistory(state, area, plan);
      push({ type: "FOCUS_AREA", id: area.id, operation: "REMOVE", kind: history ? "HISTORICAL_PRESERVED" : "REMOVED", label: area.name, explanation: history ? "This focus area leaves the current plan and remains as context for preserved Tasks and snapshots." : "This unused focus area will be removed from current plan data.", before, history });
      continue;
    }
    const after = removeUndefined({ id: wanted.id, name: wanted.name, description: wanted.description, targetMinutes: wanted.targetMinutes });
    const changed = Boolean(area.removedFromPlanAt) || !isEqual(before, after) || area.position !== wanted.position;
    if (changed) {
      const history = hasFocusAreaHistory(state, area, plan);
      push({ type: "FOCUS_AREA", id: area.id, operation: "UPDATE", kind: history ? "HISTORICAL_PRESERVED" : "CHANGED", label: wanted.name, explanation: history ? "Current focus-area intent changes; captured names on historical work remain unchanged." : area.removedFromPlanAt ? "This stable ID returns to the current plan." : "Current focus-area intent changes.", before: { ...before, position: area.position, removedFromPlan: Boolean(area.removedFromPlanAt) }, after: { ...after, position: wanted.position }, history });
    }
  }
  for (const area of plan.focusAreas) if (!state.records.focusAreas[area.id]) {
    const after = removeUndefined({ id: area.id, name: area.name, description: area.description, targetMinutes: area.targetMinutes });
    push({ type: "FOCUS_AREA", id: area.id, operation: "ADD", kind: "ADDED", label: area.name, explanation: "Added as current plan intent.", after: { ...after, position: incomingAreas.get(area.id)!.position }, history: false });
  }

  const incomingMilestones = new Map(plan.milestones.map((item, position) => [item.id, { ...item, position }]));
  const existingMilestones = Object.values(state.records.milestones).filter((milestone) => milestone.quarterId === plan.quarter.id);
  for (const milestone of existingMilestones) {
    const wanted = incomingMilestones.get(milestone.id);
    const before = removeUndefined({ id: milestone.id, title: milestone.title, description: milestone.description, start: milestone.startDate, end: milestone.endDate, mode: milestone.mode });
    if (!wanted) {
      if (milestone.removedFromPlanAt) continue;
      const history = hasMilestoneHistory(state, milestone, plan);
      push({ type: "MILESTONE", id: milestone.id, operation: "REMOVE", kind: history ? "HISTORICAL_PRESERVED" : "REMOVED", label: milestone.title, explanation: history ? "This period leaves the current plan and remains as context for preserved Tasks, reflections, and snapshots." : "This unused period will be removed from current plan data.", before, history });
      continue;
    }
    const after = removeUndefined({ id: wanted.id, title: wanted.title, description: wanted.description, start: wanted.start, end: wanted.end, mode: wanted.mode });
    const changed = Boolean(milestone.removedFromPlanAt) || !isEqual(before, after) || milestone.position !== wanted.position;
    if (changed) {
      const history = hasMilestoneHistory(state, milestone, plan);
      push({ type: "MILESTONE", id: milestone.id, operation: "UPDATE", kind: history ? "HISTORICAL_PRESERVED" : "CHANGED", label: wanted.title, explanation: history ? "Current period intent changes; its original captured boundary remains available in historical summaries." : milestone.removedFromPlanAt ? "This stable ID returns to the current plan." : "Current period intent changes.", before: { ...before, position: milestone.position, removedFromPlan: Boolean(milestone.removedFromPlanAt) }, after: { ...after, position: wanted.position }, history });
    }
  }
  for (const milestone of plan.milestones) if (!state.records.milestones[milestone.id]) {
    const after = removeUndefined({ id: milestone.id, title: milestone.title, description: milestone.description, start: milestone.start, end: milestone.end, mode: milestone.mode });
    push({ type: "MILESTONE", id: milestone.id, operation: "ADD", kind: "ADDED", label: milestone.title, explanation: "Added as a named Quarter period.", after: { ...after, position: incomingMilestones.get(milestone.id)!.position }, history: false });
  }

  const incomingTasks = new Map(plan.tasks.map((item, position) => [item.id, { ...item, position }]));
  const existingTasks = Object.values(state.records.tasks).filter((task) => task.quarterId === plan.quarter.id);
  for (const task of existingTasks) {
    const wanted = incomingTasks.get(task.id);
    const before = removeUndefined({ id: task.id, milestoneId: task.milestoneId, focusAreaId: task.focusAreaId, date: task.plannedDate, title: task.title, description: task.description, plannedMinutes: task.plannedMinutes, tags: task.tags, recommendationMode: task.recommendationMode, decisionPrompt: task.decisionPrompt });
    if (!wanted) {
      if (task.removedFromPlanAt) continue;
      const history = hasTaskHistory(state, task);
      const active = task.status === "IN_PROGRESS" || task.status === "PAUSED";
      push({ type: "TASK", id: task.id, operation: "REMOVE", kind: active ? "CONFLICT" : history ? "HISTORICAL_PRESERVED" : "REMOVED", label: task.title,
        explanation: history ? `This Task leaves future plan intent. ${active ? "It remains open and its current work and Sessions are preserved." : "Its status, sessions, snapshots, outcomes, and links remain unchanged."}` : "This pristine Task will be removed without recording a Skip or completion.",
        before: { ...before, status: task.status, position: task.position }, history });
      continue;
    }
    const after = removeUndefined({ id: wanted.id, milestoneId: wanted.milestoneId, focusAreaId: wanted.focusAreaId, date: wanted.date, title: wanted.title, description: wanted.description, plannedMinutes: wanted.plannedMinutes, tags: wanted.tags, recommendationMode: wanted.recommendationMode, decisionPrompt: wanted.decisionPrompt });
    const changed = Boolean(task.removedFromPlanAt) || !isEqual(before, after) || task.position !== wanted.position;
    if (changed) {
      const history = hasTaskHistory(state, task);
      const active = task.status === "IN_PROGRESS" || task.status === "PAUSED";
      push({ type: "TASK", id: task.id, operation: "UPDATE", kind: active ? "CONFLICT" : history ? "HISTORICAL_PRESERVED" : "CHANGED", label: wanted.title,
        explanation: history ? `Current plan intent changes; captured context, status${active ? ", active work," : ","} Sessions, reviews, and links are preserved.` : task.removedFromPlanAt ? "This stable ID returns to the current plan without resetting its execution state." : "Current Task plan details change.",
        before: { ...before, status: task.status, position: task.position, removedFromPlan: Boolean(task.removedFromPlanAt) }, after: { ...after, position: wanted.position }, history });
    }
  }
  for (const task of plan.tasks) if (!state.records.tasks[task.id]) {
    const after = removeUndefined({ id: task.id, milestoneId: task.milestoneId, focusAreaId: task.focusAreaId, date: task.date, title: task.title, description: task.description, plannedMinutes: task.plannedMinutes, tags: task.tags, recommendationMode: task.recommendationMode, decisionPrompt: task.decisionPrompt });
    push({ type: "TASK", id: task.id, operation: "ADD", kind: "ADDED", label: task.title, explanation: "Added as Not started plan intent only. No session, outcome, reflection, decision, or completion is created.", after: { ...after, position: incomingTasks.get(task.id)!.position, status: "NOT_STARTED" }, history: false });
  }
  return { changes, acknowledgements };
}

function assertIdentityAvailable(state: JourneyState, plan: NormalizedPlan): void {
  const quarterId = plan.quarter.id;
  const occupied = new Map<string, { kind: string; quarterId?: string; taskId?: string }>();
  for (const name of Object.keys(state.records) as Array<keyof JourneyState["records"]>) {
    for (const [id, record] of Object.entries(state.records[name])) {
      const item = record as unknown as { quarterId?: string; relatedTaskId?: string };
      occupied.set(id, { kind: name, ...(item.quarterId ? { quarterId: item.quarterId } : {}), ...(item.relatedTaskId ? { taskId: item.relatedTaskId } : {}) });
    }
  }
  for (const criterion of Object.values(state.records.quarters).flatMap((quarter) => quarter.successCriteria.map((item) => ({ ...item, quarterId: quarter.id })))) {
    occupied.set(criterion.id, { kind: "criterion", quarterId: criterion.quarterId });
  }
  for (const task of Object.values(state.records.tasks)) if (task.decisionPrompt) {
    occupied.set(task.decisionPrompt.decisionId, { kind: "decisionPrompt", quarterId: task.quarterId, taskId: task.id });
  }
  const candidate: Array<{ id: string; kind: string; taskId?: string }> = [
    { id: plan.quarter.id, kind: "quarters" },
    ...plan.quarter.successCriteria.map((item) => ({ id: item.id, kind: "criterion" })),
    ...plan.focusAreas.map((item) => ({ id: item.id, kind: "focusAreas" })),
    ...plan.milestones.map((item) => ({ id: item.id, kind: "milestones" })),
    ...plan.tasks.flatMap((item) => [
      { id: item.id, kind: "tasks" },
      ...(item.decisionPrompt ? [{ id: item.decisionPrompt.decisionId, kind: "decisionPrompt", taskId: item.id }] : []),
    ]),
  ];
  for (const entry of candidate) {
    const prior = occupied.get(entry.id);
    if (!prior) continue;
    const sameQuarterPlanEntity = prior.kind === entry.kind && (
      (entry.kind === "quarters" && entry.id === quarterId) || prior.quarterId === quarterId
    ) && ["quarters", "criterion", "focusAreas", "milestones", "tasks"].includes(entry.kind);
    const sameTaskDecision = entry.kind === "decisionPrompt" && prior.kind === "decisionRecords" && prior.taskId === entry.taskId;
    const sameExistingPrompt = entry.kind === "decisionPrompt" && prior.kind === "decisionPrompt" && prior.taskId === entry.taskId;
    if (!sameQuarterPlanEntity && !sameTaskDecision && !sameExistingPrompt) {
      failValidation([`/: id ${entry.id} is already used by ${prior.kind}${prior.taskId ? ` for Task ${prior.taskId}` : ""}`]);
    }
  }
}

function assertNoQuarterOverlap(state: JourneyState, userId: string, plan: NormalizedPlan): void {
  const conflict = Object.values(state.records.quarters).find((quarter) => quarter.userId === userId && quarter.id !== plan.quarter.id &&
    plan.quarter.start <= quarter.endDate && quarter.startDate <= plan.quarter.end);
  if (conflict) throw new AppError(409, "QUARTER_DATE_OVERLAP", "Quarter dates overlap", `The plan overlaps ${conflict.title} (${conflict.startDate} to ${conflict.endDate}).`);
}

function ensureNoDuplicateIds(ids: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) failValidation([`/: ${label} contains duplicate acknowledgement or identity ${id}`]);
    seen.add(id);
  }
}

function hasReferencesToTask(state: JourneyState, taskId: string): boolean {
  return Boolean(Object.values(state.records.sessions).some((item) => item.taskId === taskId) ||
    Object.values(state.records.taskLifecycleEvents).some((item) => item.taskId === taskId) ||
    Object.values(state.records.dailyReviews).some((item) => item.taskId === taskId) ||
    Object.values(state.records.journeyEntries).some((item) => item.relatedTaskId === taskId) ||
    Object.values(state.records.decisionRecords).some((item) => item.relatedTaskId === taskId) ||
    Object.values(state.records.aiReviews).some((record) => { const review = record as { targetType?: unknown; targetId?: unknown }; return review.targetType === "TASK" && review.targetId === taskId; }) ||
    Object.values(state.records.tasks).some((item) => item.continuationOfTaskId === taskId));
}

function canDeleteTask(state: JourneyState, task: TaskRecord): boolean {
  return task.status === "NOT_STARTED" && !task.planSnapshot && !task.continuationOfTaskId && !hasReferencesToTask(state, task.id);
}

function canDeleteFocusArea(state: JourneyState, area: FocusAreaRecord): boolean {
  return !Object.values(state.records.tasks).some((task) => task.focusAreaId === area.id || task.planSnapshot?.focusAreaId === area.id);
}

function canDeleteMilestone(state: JourneyState, milestone: MilestoneRecord): boolean {
  return !milestone.intentSnapshot &&
    !Object.values(state.records.tasks).some((task) => task.milestoneId === milestone.id || task.planSnapshot?.milestoneId === milestone.id) &&
    !Object.values(state.records.journeyEntries).some((entry) => entry.relatedMilestoneId === milestone.id) &&
    !Object.values(state.records.aiReviews).some((record) => { const review = record as { targetType?: unknown; targetId?: unknown }; return review.targetType === "WEEK" && review.targetId === milestone.id; });
}

function createQuarter(state: JourneyState, userId: string, plan: NormalizedPlan, now: string): QuarterRecord {
  const quarter: QuarterRecord = {
    id: plan.quarter.id, userId, title: plan.quarter.title,
    ...(plan.quarter.description ? { description: plan.quarter.description } : {}),
    ...(plan.quarter.mantra ? { mantra: plan.quarter.mantra } : {}),
    startDate: plan.quarter.start, endDate: plan.quarter.end,
    successCriteria: plan.quarter.successCriteria.map((item, position) => ({ ...item, position })),
    planRevision: 1, lastPlanImportedAt: now, createdAt: now, updatedAt: now,
  };
  state.records.quarters[quarter.id] = quarter;
  return quarter;
}

function applyPlan(state: JourneyState, userId: string, plan: NormalizedPlan, now: string): void {
  const existingQuarter = state.records.quarters[plan.quarter.id];
  if (!existingQuarter) createQuarter(state, userId, plan, now);
  else {
    existingQuarter.title = plan.quarter.title;
    existingQuarter.startDate = plan.quarter.start;
    existingQuarter.endDate = plan.quarter.end;
    existingQuarter.successCriteria = plan.quarter.successCriteria.map((item, position) => ({ ...item, position }));
    if (plan.quarter.description) existingQuarter.description = plan.quarter.description; else delete existingQuarter.description;
    if (plan.quarter.mantra) existingQuarter.mantra = plan.quarter.mantra; else delete existingQuarter.mantra;
    existingQuarter.planRevision += 1;
    existingQuarter.lastPlanImportedAt = now;
    existingQuarter.updatedAt = now;
  }
  const quarterId = plan.quarter.id;

  const desiredAreaIds = new Set(plan.focusAreas.map((item) => item.id));
  const desiredMilestoneIds = new Set(plan.milestones.map((item) => item.id));
  const desiredTaskIds = new Set(plan.tasks.map((item) => item.id));

  for (const task of Object.values(state.records.tasks)) {
    if (task.quarterId !== quarterId || task.removedFromPlanAt || desiredTaskIds.has(task.id)) continue;
    if (canDeleteTask(state, task)) delete state.records.tasks[task.id];
    else { task.removedFromPlanAt = now; task.updatedAt = now; }
  }
  for (const [position, item] of plan.tasks.entries()) {
    const existing = state.records.tasks[item.id];
    const planFields = {
      quarterId,
      ...(item.focusAreaId ? { focusAreaId: item.focusAreaId } : {}),
      milestoneId: item.milestoneId,
      plannedDate: item.date,
      title: item.title,
      ...(item.description ? { description: item.description } : {}),
      ...(item.plannedMinutes ? { plannedMinutes: item.plannedMinutes } : {}),
      tags: [...item.tags],
      position,
      recommendationMode: item.recommendationMode,
      ...(item.decisionPrompt ? { decisionPrompt: { ...item.decisionPrompt } } : {}),
    };
    if (existing) {
      Object.assign(existing, planFields);
      if (item.focusAreaId) existing.focusAreaId = item.focusAreaId; else delete existing.focusAreaId;
      if (item.description) existing.description = item.description; else delete existing.description;
      if (item.plannedMinutes) existing.plannedMinutes = item.plannedMinutes; else delete existing.plannedMinutes;
      if (item.decisionPrompt) existing.decisionPrompt = { ...item.decisionPrompt }; else delete existing.decisionPrompt;
      delete existing.removedFromPlanAt;
      existing.updatedAt = now;
    } else {
      const task: TaskRecord = { id: item.id, ...planFields, status: "NOT_STARTED", createdAt: now, updatedAt: now };
      state.records.tasks[item.id] = task;
    }
  }

  for (const milestone of Object.values(state.records.milestones)) {
    if (milestone.quarterId !== quarterId || milestone.removedFromPlanAt || desiredMilestoneIds.has(milestone.id)) continue;
    if (canDeleteMilestone(state, milestone)) delete state.records.milestones[milestone.id];
    else { milestone.removedFromPlanAt = now; milestone.updatedAt = now; }
  }
  for (const [position, item] of plan.milestones.entries()) {
    const existing = state.records.milestones[item.id];
    if (existing) {
      existing.title = item.title;
      existing.startDate = item.start;
      existing.endDate = item.end;
      existing.mode = item.mode;
      existing.position = position;
      if (item.description) existing.description = item.description; else delete existing.description;
      delete existing.removedFromPlanAt;
      existing.updatedAt = now;
    } else {
      const milestone: MilestoneRecord = {
        id: item.id, quarterId, title: item.title,
        ...(item.description ? { description: item.description } : {}), startDate: item.start, endDate: item.end,
        mode: item.mode, position, createdAt: now, updatedAt: now,
      };
      state.records.milestones[item.id] = milestone;
    }
  }

  for (const area of Object.values(state.records.focusAreas)) {
    if (area.quarterId !== quarterId || area.removedFromPlanAt || desiredAreaIds.has(area.id)) continue;
    if (canDeleteFocusArea(state, area)) delete state.records.focusAreas[area.id];
    else { area.removedFromPlanAt = now; area.updatedAt = now; }
  }
  for (const [position, item] of plan.focusAreas.entries()) {
    const existing = state.records.focusAreas[item.id];
    if (existing) {
      existing.name = item.name;
      existing.position = position;
      if (item.description) existing.description = item.description; else delete existing.description;
      if (item.targetMinutes) existing.targetMinutes = item.targetMinutes; else delete existing.targetMinutes;
      delete existing.removedFromPlanAt;
      existing.updatedAt = now;
    } else {
      const area: FocusAreaRecord = {
        id: item.id, quarterId, name: item.name,
        ...(item.description ? { description: item.description } : {}),
        ...(item.targetMinutes ? { targetMinutes: item.targetMinutes } : {}),
        position, createdAt: now, updatedAt: now,
      };
      state.records.focusAreas[item.id] = area;
    }
  }
}

function writeReceipt(state: JourneyState, userId: string, key: string, fingerprint: string, quarterId: string, mode: PreviewMode, now: string): void {
  const receipt: CommandReceipt = {
    userId, key, method: "POST", route, requestFingerprint: fingerprint,
    result: { outcomeKind: "APPLY_PLAN", createdRecordIds: mode === "CREATE_QUARTER" ? [quarterId] : [], affectedRecordIds: [quarterId], outcomeFacts: { quarterId, mode } },
    committedStoreRevision: state.storeRevision + 1, createdAt: now,
  };
  state.commandReceipts[`${userId}:${key}`] = receipt;
}

function getReceipt(state: JourneyState, userId: string, key: string, fingerprint: string): CommandReceipt | undefined {
  const existing = state.commandReceipts[`${userId}:${key}`];
  if (existing && existing.requestFingerprint !== fingerprint) {
    throw new AppError(409, "IDEMPOTENCY_KEY_REUSED", "That action key was already used", "Use a new action key for a different plan apply request.");
  }
  return existing;
}

export function exportQuarterPlanYaml(state: JourneyState, quarter: QuarterRecord): string {
  const plan = currentPlan(state, quarter);
  return stringify(plan, { lineWidth: 0 });
}

export class PlanCommandService {
  private readonly previews = new Map<string, PreviewRecord>();

  constructor(private readonly store: JourneyStore, private readonly currentUser: CurrentUserProvider, private readonly clock: Clock, private readonly ids: IdGenerator) {}

  async preview(source: string) {
    let plan: NormalizedPlan;
    try { plan = parseAndNormalizePlanYaml(source); }
    catch (error) {
      if (error instanceof PlanValidationError) failValidation(error.errors);
      throw error;
    }
    const userId = await this.currentUser.getCurrentUserId();
    const now = this.clock.now();
    const view = await this.store.read((state) => {
      assertIdentityAvailable(state, plan);
      assertNoQuarterOverlap(state, userId, plan);
      const quarter = state.records.quarters[plan.quarter.id];
      if (quarter && quarter.userId !== userId) throw notFound();
      const { changes, acknowledgements } = summarizeDiff(state, userId, plan);
      return {
        mode: quarter ? "UPDATE_QUARTER" as const : "CREATE_QUARTER" as const,
        basePlanRevision: quarter?.planRevision ?? null,
        baseEtag: quarter ? quarterEtag(quarter) : null,
        changes,
        acknowledgements,
      };
    });
    const token = this.ids.generate();
    const expiresAt = new Date(now.getTime() + PREVIEW_LIFETIME_MS).toISOString();
    const record: PreviewRecord = { userId, plan, quarterId: plan.quarter.id, expiresAt, ...view };
    this.previews.set(token, record);
    return {
      previewToken: token, expiresAt, mode: view.mode, quarterId: plan.quarter.id,
      basePlanRevision: view.basePlanRevision, baseEtag: view.baseEtag,
      summary: {
        added: view.changes.filter((change) => change.operation === "ADD").length,
        changed: view.changes.filter((change) => change.operation === "UPDATE").length,
        removed: view.changes.filter((change) => change.operation === "REMOVE").length,
        historicalPreserved: view.changes.filter((change) => change.historyPreserved).length,
        conflicts: view.changes.filter((change) => change.kind === "CONFLICT").length,
      },
      changes: view.changes,
      requiredAcknowledgements: view.acknowledgements,
    };
  }

  async apply(input: { previewToken: string; acknowledgementIds: string[] }, key: string, precondition: { ifMatch?: string; ifNoneMatch?: string }) {
    ensureNoDuplicateIds(input.acknowledgementIds, "acknowledgement IDs");
    const userId = await this.currentUser.getCurrentUserId();
    const body = { previewToken: input.previewToken, acknowledgementIds: [...input.acknowledgementIds] };
    const fingerprint = opaqueHash({ method: "POST", route, body, ifMatch: precondition.ifMatch ?? null, ifNoneMatch: precondition.ifNoneMatch ?? null });
    const now = this.clock.now().toISOString();
    let replayed = false;
    const transaction = await this.store.transact({ kind: "PLAN_APPLY" }, (draft) => {
      // Receipt replay intentionally precedes preview lookup/expiry and base revision checks.
      const receipt = getReceipt(draft, userId, key, fingerprint);
      if (receipt) {
        replayed = true;
        return { kind: "no-change" as const, value: String(receipt.result.outcomeFacts.quarterId) };
      }
      const preview = this.previews.get(input.previewToken);
      if (!preview || preview.userId !== userId || preview.expiresAt <= now) {
        throw new AppError(410, "PLAN_PREVIEW_EXPIRED", "This preview is no longer available", "Preview the YAML again before applying it.");
      }
      if (preview.mode === "UPDATE_QUARTER") {
        if (!precondition.ifMatch) throw new AppError(428, "PRECONDITION_REQUIRED", "A current plan version is required", "Use the ETag from the preview and try again.");
        if (precondition.ifMatch !== preview.baseEtag) throw new AppError(412, "STALE_WRITE", "This plan preview has a different base version", "Preview the plan again before applying it.");
      } else {
        if (precondition.ifNoneMatch !== "*") throw new AppError(428, "PRECONDITION_REQUIRED", "A create precondition is required", "Confirm that the Quarter does not already exist and try again.");
      }
      const quarter = draft.records.quarters[preview.quarterId];
      if (preview.mode === "UPDATE_QUARTER") {
        if (!quarter || quarter.userId !== userId) throw notFound();
        if (quarter.planRevision !== preview.basePlanRevision) {
          throw new AppError(409, "PLAN_REVISION_CHANGED", "The plan changed after preview", "Refresh the Quarter and create a new preview.", { currentPlanRevision: quarter.planRevision });
        }
      } else if (quarter) {
        throw new AppError(412, "STALE_WRITE", "This Quarter was created after preview", "Refresh the Quarter list and preview the plan again.", { resolutions: [{ kind: "REFRESH" }] });
      }
      const currentDiff = summarizeDiff(draft, userId, preview.plan);
      if (!isEqual(currentDiff.changes, preview.changes) || !isEqual(currentDiff.acknowledgements, preview.acknowledgements)) {
        throw new AppError(412, "STALE_WRITE", "Work changed after this preview", "A Task or history reference changed after Preview. Preview the plan again so its impact and acknowledgements are current.", { resolutions: [{ kind: "REFRESH" }] });
      }
      const required = preview.acknowledgements.map((item) => item.id).sort();
      const supplied = [...input.acknowledgementIds].sort();
      if (!isEqual(required, supplied)) {
        throw new AppError(409, "ACKNOWLEDGEMENT_REQUIRED", "Plan changes need confirmation", "Confirm every listed plan change, then apply again.", { requiredAcknowledgements: preview.acknowledgements });
      }
      assertIdentityAvailable(draft, preview.plan);
      assertNoQuarterOverlap(draft, userId, preview.plan);
      applyPlan(draft, userId, preview.plan, now);
      writeReceipt(draft, userId, key, fingerprint, preview.quarterId, preview.mode, now);
      return { kind: "changed" as const, value: preview.quarterId };
    });
    const quarter = transaction.state.records.quarters[transaction.value];
    if (!quarter || quarter.userId !== userId) throw notFound();
    return {
      mode: String(transaction.state.commandReceipts[`${userId}:${key}`]?.result.outcomeFacts.mode ?? "UPDATE_QUARTER") as PreviewMode,
      quarterId: quarter.id,
      planRevision: quarter.planRevision,
      etag: quarterEtag(quarter),
      changed: !replayed && transaction.changed,
      replayed,
      detail: projectQuarterDetail(transaction.state, userId, quarter.id, this.clock.now()),
    };
  }

  async export(quarterId: string) {
    const userId = await this.currentUser.getCurrentUserId();
    return this.store.read((state) => {
      const quarter = state.records.quarters[quarterId];
      if (!quarter || quarter.userId !== userId) throw notFound();
      return { content: exportQuarterPlanYaml(state, quarter), etag: quarterEtag(quarter), filename: `${quarter.id}-plan.yaml` };
    });
  }
}

export const planPreviewLifetimeMs = PREVIEW_LIFETIME_MS;
