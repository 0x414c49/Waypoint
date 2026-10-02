// Row <-> domain mappers for the SQLite store (ADR-0014).
// Pure functions only: snake_case <-> camelCase, JSON parse/stringify for
// snapshot/array/blob columns, NULL <-> absent normalization for optionals.
// Fail-closed: a row whose shape drifts from the domain throws STORE_CORRUPT
// instead of coercing.

import type {
  AccountRecord,
  AuthInviteRecord,
  AuthSessionRecord,
  CommandReceipt,
  DailyReviewRecord,
  DecisionRecord,
  DecisionReviewRecord,
  EmailPreferenceRecord,
  FocusAreaRecord,
  JourneyEntryRecord,
  MediaRecord,
  MilestoneRecord,
  QuarterRecord,
  SessionRecord,
  TaskLifecycleEventRecord,
  TaskRecord,
  UserRecord,
} from "../../domain/journey-state.js";
import type { JourneyState } from "../../domain/journey-state.js";
import { StoreError } from "../store-errors.js";

type LegacyAIReviewRecord = JourneyState["records"]["aiReviews"][string];

export type RowValue = string | number | bigint | null;
export type Row = Record<string, unknown>;
export type RowParams = Record<string, RowValue>;

function text(row: Row, name: string): string {
  const value = row[name];
  if (typeof value !== "string") {
    throw new StoreError("STORE_CORRUPT", `SQLite row field ${name} is not text.`);
  }
  return value;
}

function nullableText(row: Row, name: string): string | null {
  const value = row[name];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new StoreError("STORE_CORRUPT", `SQLite row field ${name} is neither text nor null.`);
  }
  return value;
}

function integer(row: Row, name: string): number {
  const value = row[name];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new StoreError("STORE_CORRUPT", `SQLite row field ${name} is not an integer.`);
  }
  return value;
}

function nullableInteger(row: Row, name: string): number | null {
  const value = row[name];
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new StoreError("STORE_CORRUPT", `SQLite row field ${name} is neither an integer nor null.`);
  }
  return value;
}

function encodeJson(value: unknown): string {
  return JSON.stringify(value);
}

function decodeJson<T>(value: string, label: string): T {
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    throw new StoreError("STORE_CORRUPT", `SQLite JSON column ${label} is not valid JSON.`, error);
  }
}

function toIntFlag(value: boolean): number {
  return value ? 1 : 0;
}

function fromIntFlag(row: Row, name: string): boolean {
  const value = integer(row, name);
  if (value !== 0 && value !== 1) {
    throw new StoreError("STORE_CORRUPT", `SQLite row field ${name} is not a 0/1 flag.`);
  }
  return value === 1;
}

// --- users ---

export function userToRow(record: UserRecord): RowParams {
  return { id: record.id, name: record.name, time_zone: record.timeZone, created_at: record.createdAt };
}

export function rowToUser(row: Row): UserRecord {
  return { id: text(row, "id"), name: text(row, "name"), timeZone: text(row, "time_zone"), createdAt: text(row, "created_at") };
}

// --- accounts ---

export function accountToRow(record: AccountRecord): RowParams {
  return {
    id: record.id,
    user_id: record.userId,
    email: record.email,
    role: record.role,
    password_verifier: encodeJson(record.passwordVerifier),
    totp_secret_cipher: record.totpSecretCipher === undefined ? null : encodeJson(record.totpSecretCipher),
    last_totp_step: record.lastTotpStep ?? null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    disabled_at: record.disabledAt ?? null,
  };
}

export function rowToAccount(row: Row): AccountRecord {
  const totpCipher = nullableText(row, "totp_secret_cipher");
  const lastTotpStep = nullableInteger(row, "last_totp_step");
  const disabledAt = nullableText(row, "disabled_at");
  return {
    id: text(row, "id"),
    userId: text(row, "user_id"),
    email: text(row, "email"),
    role: text(row, "role") as AccountRecord["role"],
    passwordVerifier: decodeJson(text(row, "password_verifier"), "accounts.password_verifier"),
    ...(totpCipher === null ? {} : { totpSecretCipher: decodeJson(totpCipher, "accounts.totp_secret_cipher") }),
    ...(lastTotpStep === null ? {} : { lastTotpStep }),
    createdAt: text(row, "created_at"),
    updatedAt: text(row, "updated_at"),
    ...(disabledAt === null ? {} : { disabledAt }),
  };
}

// --- auth invites ---

export function authInviteToRow(record: AuthInviteRecord): RowParams {
  return {
    id: record.id,
    intended_email: record.intendedEmail,
    role: record.role,
    created_by_user_id: record.createdByUserId ?? null,
    bootstrap: toIntFlag(record.bootstrap),
    legacy_user_id: record.legacyUserId ?? null,
    created_at: record.createdAt,
    expires_at: record.expiresAt,
    consumed_at: record.consumedAt ?? null,
    consumed_by_user_id: record.consumedByUserId ?? null,
    revoked_at: record.revokedAt ?? null,
  };
}

export function rowToAuthInvite(row: Row): AuthInviteRecord {
  const createdByUserId = nullableText(row, "created_by_user_id");
  const legacyUserId = nullableText(row, "legacy_user_id");
  const consumedAt = nullableText(row, "consumed_at");
  const consumedByUserId = nullableText(row, "consumed_by_user_id");
  const revokedAt = nullableText(row, "revoked_at");
  return {
    id: text(row, "id"),
    intendedEmail: text(row, "intended_email"),
    role: text(row, "role") as AuthInviteRecord["role"],
    ...(createdByUserId === null ? {} : { createdByUserId }),
    bootstrap: fromIntFlag(row, "bootstrap"),
    ...(legacyUserId === null ? {} : { legacyUserId }),
    createdAt: text(row, "created_at"),
    expiresAt: text(row, "expires_at"),
    ...(consumedAt === null ? {} : { consumedAt }),
    ...(consumedByUserId === null ? {} : { consumedByUserId }),
    ...(revokedAt === null ? {} : { revokedAt }),
  };
}

// --- auth sessions ---

export function authSessionToRow(record: AuthSessionRecord): RowParams {
  return {
    id: record.id,
    account_id: record.accountId,
    user_id: record.userId,
    created_at: record.createdAt,
    last_seen_at: record.lastSeenAt,
    expires_at: record.expiresAt,
    revoked_at: record.revokedAt ?? null,
  };
}

export function rowToAuthSession(row: Row): AuthSessionRecord {
  const revokedAt = nullableText(row, "revoked_at");
  return {
    id: text(row, "id"),
    accountId: text(row, "account_id"),
    userId: text(row, "user_id"),
    createdAt: text(row, "created_at"),
    lastSeenAt: text(row, "last_seen_at"),
    expiresAt: text(row, "expires_at"),
    ...(revokedAt === null ? {} : { revokedAt }),
  };
}

// --- media records ---

export function mediaRecordToRow(record: MediaRecord): RowParams {
  return {
    id: record.id,
    filename: record.filename,
    user_id: record.userId,
    media_type: record.mediaType,
    byte_length: record.byteLength,
    created_at: record.createdAt,
  };
}

export function rowToMediaRecord(row: Row): MediaRecord {
  return {
    id: text(row, "id"),
    filename: text(row, "filename"),
    userId: text(row, "user_id"),
    mediaType: text(row, "media_type") as MediaRecord["mediaType"],
    byteLength: integer(row, "byte_length"),
    createdAt: text(row, "created_at"),
  };
}

// --- email preferences (id equals userId) ---

export function emailPreferenceToRow(record: EmailPreferenceRecord): RowParams {
  return {
    id: record.id,
    user_id: record.userId,
    digest_unsubscribed_at: record.digestUnsubscribedAt ?? null,
    updated_at: record.updatedAt,
  };
}

export function rowToEmailPreference(row: Row): EmailPreferenceRecord {
  const digestUnsubscribedAt = nullableText(row, "digest_unsubscribed_at");
  return {
    id: text(row, "id"),
    userId: text(row, "user_id"),
    ...(digestUnsubscribedAt === null ? {} : { digestUnsubscribedAt }),
    updatedAt: text(row, "updated_at"),
  };
}

// --- quarters ---

export function quarterToRow(record: QuarterRecord): RowParams {
  return {
    id: record.id,
    user_id: record.userId,
    title: record.title,
    description: record.description ?? null,
    mantra: record.mantra ?? null,
    start_date: record.startDate,
    end_date: record.endDate,
    success_criteria: encodeJson(record.successCriteria),
    plan_revision: record.planRevision,
    last_plan_imported_at: record.lastPlanImportedAt ?? null,
    intent_snapshot: record.intentSnapshot === undefined ? null : encodeJson(record.intentSnapshot),
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function rowToQuarter(row: Row): QuarterRecord {
  const description = nullableText(row, "description");
  const mantra = nullableText(row, "mantra");
  const lastPlanImportedAt = nullableText(row, "last_plan_imported_at");
  const intentSnapshot = nullableText(row, "intent_snapshot");
  return {
    id: text(row, "id"),
    userId: text(row, "user_id"),
    title: text(row, "title"),
    ...(description === null ? {} : { description }),
    ...(mantra === null ? {} : { mantra }),
    startDate: text(row, "start_date"),
    endDate: text(row, "end_date"),
    successCriteria: decodeJson(text(row, "success_criteria"), "quarters.success_criteria"),
    planRevision: integer(row, "plan_revision"),
    ...(lastPlanImportedAt === null ? {} : { lastPlanImportedAt }),
    ...(intentSnapshot === null ? {} : { intentSnapshot: decodeJson(intentSnapshot, "quarters.intent_snapshot") }),
    createdAt: text(row, "created_at"),
    updatedAt: text(row, "updated_at"),
  };
}

// --- focus areas ---

export function focusAreaToRow(record: FocusAreaRecord): RowParams {
  return {
    id: record.id,
    quarter_id: record.quarterId,
    name: record.name,
    description: record.description ?? null,
    target_minutes: record.targetMinutes ?? null,
    position: record.position,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    removed_from_plan_at: record.removedFromPlanAt ?? null,
  };
}

export function rowToFocusArea(row: Row): FocusAreaRecord {
  const description = nullableText(row, "description");
  const targetMinutes = nullableInteger(row, "target_minutes");
  const removedFromPlanAt = nullableText(row, "removed_from_plan_at");
  return {
    id: text(row, "id"),
    quarterId: text(row, "quarter_id"),
    name: text(row, "name"),
    ...(description === null ? {} : { description }),
    ...(targetMinutes === null ? {} : { targetMinutes }),
    position: integer(row, "position"),
    createdAt: text(row, "created_at"),
    updatedAt: text(row, "updated_at"),
    ...(removedFromPlanAt === null ? {} : { removedFromPlanAt }),
  };
}

// --- milestones ---

export function milestoneToRow(record: MilestoneRecord): RowParams {
  return {
    id: record.id,
    quarter_id: record.quarterId,
    title: record.title,
    description: record.description ?? null,
    start_date: record.startDate,
    end_date: record.endDate,
    mode: record.mode,
    position: record.position,
    intent_snapshot: record.intentSnapshot === undefined ? null : encodeJson(record.intentSnapshot),
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    removed_from_plan_at: record.removedFromPlanAt ?? null,
  };
}

export function rowToMilestone(row: Row): MilestoneRecord {
  const description = nullableText(row, "description");
  const intentSnapshot = nullableText(row, "intent_snapshot");
  const removedFromPlanAt = nullableText(row, "removed_from_plan_at");
  return {
    id: text(row, "id"),
    quarterId: text(row, "quarter_id"),
    title: text(row, "title"),
    ...(description === null ? {} : { description }),
    startDate: text(row, "start_date"),
    endDate: text(row, "end_date"),
    mode: text(row, "mode") as MilestoneRecord["mode"],
    position: integer(row, "position"),
    ...(intentSnapshot === null ? {} : { intentSnapshot: decodeJson(intentSnapshot, "milestones.intent_snapshot") }),
    createdAt: text(row, "created_at"),
    updatedAt: text(row, "updated_at"),
    ...(removedFromPlanAt === null ? {} : { removedFromPlanAt }),
  };
}

// --- tasks ---

export function taskToRow(record: TaskRecord): RowParams {
  return {
    id: record.id,
    quarter_id: record.quarterId,
    focus_area_id: record.focusAreaId ?? null,
    milestone_id: record.milestoneId ?? null,
    planned_date: record.plannedDate,
    title: record.title,
    description: record.description ?? null,
    planned_minutes: record.plannedMinutes ?? null,
    tags: encodeJson(record.tags),
    position: record.position,
    recommendation_mode: record.recommendationMode,
    decision_prompt: record.decisionPrompt === undefined ? null : encodeJson(record.decisionPrompt),
    removed_from_plan_at: record.removedFromPlanAt ?? null,
    status: record.status,
    plan_snapshot: record.planSnapshot === undefined ? null : encodeJson(record.planSnapshot),
    continuation_of_task_id: record.continuationOfTaskId ?? null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function rowToTask(row: Row): TaskRecord {
  const focusAreaId = nullableText(row, "focus_area_id");
  const milestoneId = nullableText(row, "milestone_id");
  const description = nullableText(row, "description");
  const plannedMinutes = nullableInteger(row, "planned_minutes");
  const decisionPrompt = nullableText(row, "decision_prompt");
  const removedFromPlanAt = nullableText(row, "removed_from_plan_at");
  const planSnapshot = nullableText(row, "plan_snapshot");
  const continuationOfTaskId = nullableText(row, "continuation_of_task_id");
  return {
    id: text(row, "id"),
    quarterId: text(row, "quarter_id"),
    ...(focusAreaId === null ? {} : { focusAreaId }),
    ...(milestoneId === null ? {} : { milestoneId }),
    plannedDate: text(row, "planned_date"),
    title: text(row, "title"),
    ...(description === null ? {} : { description }),
    ...(plannedMinutes === null ? {} : { plannedMinutes }),
    tags: decodeJson(text(row, "tags"), "tasks.tags"),
    position: integer(row, "position"),
    recommendationMode: text(row, "recommendation_mode") as TaskRecord["recommendationMode"],
    ...(decisionPrompt === null ? {} : { decisionPrompt: decodeJson(decisionPrompt, "tasks.decision_prompt") }),
    ...(removedFromPlanAt === null ? {} : { removedFromPlanAt }),
    status: text(row, "status") as TaskRecord["status"],
    ...(planSnapshot === null ? {} : { planSnapshot: decodeJson(planSnapshot, "tasks.plan_snapshot") }),
    ...(continuationOfTaskId === null ? {} : { continuationOfTaskId }),
    createdAt: text(row, "created_at"),
    updatedAt: text(row, "updated_at"),
  };
}

// --- sessions (owner_user_id is store-provided, never read from the record) ---

export function sessionToRow(record: SessionRecord, ownerUserId: string): RowParams {
  return {
    id: record.id,
    task_id: record.taskId,
    started_at: record.startedAt,
    ended_at: record.endedAt ?? null,
    time_zone_at_start: record.timeZoneAtStart,
    intention_minutes: record.intentionMinutes ?? null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    corrected_at: record.correctedAt ?? null,
    owner_user_id: ownerUserId,
  };
}

export function rowToSession(row: Row): SessionRecord {
  const endedAt = nullableText(row, "ended_at");
  const intentionMinutes = nullableInteger(row, "intention_minutes");
  const correctedAt = nullableText(row, "corrected_at");
  return {
    id: text(row, "id"),
    taskId: text(row, "task_id"),
    startedAt: text(row, "started_at"),
    ...(endedAt === null ? {} : { endedAt }),
    timeZoneAtStart: text(row, "time_zone_at_start"),
    ...(intentionMinutes === null ? {} : { intentionMinutes: intentionMinutes as 10 }),
    createdAt: text(row, "created_at"),
    updatedAt: text(row, "updated_at"),
    ...(correctedAt === null ? {} : { correctedAt }),
  };
}

export function sessionOwnerUserId(row: Row): string {
  return text(row, "owner_user_id");
}

// --- task lifecycle events ---

export function lifecycleEventToRow(record: TaskLifecycleEventRecord): RowParams {
  return {
    id: record.id,
    task_id: record.taskId,
    sequence: record.sequence,
    type: record.type,
    occurred_at: record.occurredAt,
    time_zone_at_occurrence: record.timeZoneAtOccurrence,
    related_task_id: record.relatedTaskId ?? null,
    undoes_event_id: record.undoesEventId ?? null,
    created_at: record.createdAt,
  };
}

export function rowToLifecycleEvent(row: Row): TaskLifecycleEventRecord {
  const relatedTaskId = nullableText(row, "related_task_id");
  const undoesEventId = nullableText(row, "undoes_event_id");
  return {
    id: text(row, "id"),
    taskId: text(row, "task_id"),
    sequence: integer(row, "sequence"),
    type: text(row, "type") as TaskLifecycleEventRecord["type"],
    occurredAt: text(row, "occurred_at"),
    timeZoneAtOccurrence: text(row, "time_zone_at_occurrence"),
    ...(relatedTaskId === null ? {} : { relatedTaskId }),
    ...(undoesEventId === null ? {} : { undoesEventId }),
    createdAt: text(row, "created_at"),
  };
}

// --- daily reviews ---

export function dailyReviewToRow(record: DailyReviewRecord): RowParams {
  return {
    id: record.id,
    task_id: record.taskId,
    finish_event_id: record.finishEventId,
    outcome: record.outcome,
    key_learning: record.keyLearning ?? null,
    reflection: record.reflection ?? null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function rowToDailyReview(row: Row): DailyReviewRecord {
  const keyLearning = nullableText(row, "key_learning");
  const reflection = nullableText(row, "reflection");
  return {
    id: text(row, "id"),
    taskId: text(row, "task_id"),
    finishEventId: text(row, "finish_event_id"),
    outcome: text(row, "outcome") as DailyReviewRecord["outcome"],
    ...(keyLearning === null ? {} : { keyLearning }),
    ...(reflection === null ? {} : { reflection }),
    createdAt: text(row, "created_at"),
    updatedAt: text(row, "updated_at"),
  };
}

// --- journey entries ---

export function journeyEntryToRow(record: JourneyEntryRecord): RowParams {
  return {
    id: record.id,
    user_id: record.userId,
    occurred_at: record.occurredAt,
    time_zone_at_occurrence: record.timeZoneAtOccurrence,
    text: record.text,
    tags: encodeJson(record.tags),
    related_task_id: record.relatedTaskId ?? null,
    related_milestone_id: record.relatedMilestoneId ?? null,
    related_decision_id: record.relatedDecisionId ?? null,
    changed_my_mind: toIntFlag(record.changedMyMind),
    feeling: record.feeling ?? null,
    created_at: record.createdAt,
    updated_at: record.updatedAt ?? null,
  };
}

export function rowToJourneyEntry(row: Row): JourneyEntryRecord {
  const relatedTaskId = nullableText(row, "related_task_id");
  const relatedMilestoneId = nullableText(row, "related_milestone_id");
  const relatedDecisionId = nullableText(row, "related_decision_id");
  const feeling = nullableText(row, "feeling");
  const updatedAt = nullableText(row, "updated_at");
  return {
    id: text(row, "id"),
    userId: text(row, "user_id"),
    occurredAt: text(row, "occurred_at"),
    timeZoneAtOccurrence: text(row, "time_zone_at_occurrence"),
    text: text(row, "text"),
    tags: decodeJson(text(row, "tags"), "journey_entries.tags"),
    ...(relatedTaskId === null ? {} : { relatedTaskId }),
    ...(relatedMilestoneId === null ? {} : { relatedMilestoneId }),
    ...(relatedDecisionId === null ? {} : { relatedDecisionId }),
    changedMyMind: fromIntFlag(row, "changed_my_mind"),
    ...(feeling === null ? {} : { feeling: feeling as NonNullable<JourneyEntryRecord["feeling"]> }),
    createdAt: text(row, "created_at"),
    ...(updatedAt === null ? {} : { updatedAt }),
  };
}

// --- decision records ---

export function decisionToRow(record: DecisionRecord): RowParams {
  return {
    id: record.id,
    user_id: record.userId,
    quarter_id: record.quarterId ?? null,
    related_task_id: record.relatedTaskId ?? null,
    supersedes_decision_id: record.supersedesDecisionId ?? null,
    title: record.title,
    decision_date: record.decisionDate ?? null,
    status: record.status,
    context: record.context ?? null,
    constraints_json: encodeJson(record.constraints),
    options_json: encodeJson(record.options),
    decision: record.decision ?? null,
    consequences: record.consequences ?? null,
    assumptions_json: encodeJson(record.assumptions),
    falsifier: record.falsifier ?? null,
    initial_review_date: record.initialReviewDate ?? null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function rowToDecision(row: Row): DecisionRecord {
  const quarterId = nullableText(row, "quarter_id");
  const relatedTaskId = nullableText(row, "related_task_id");
  const supersedesDecisionId = nullableText(row, "supersedes_decision_id");
  const decisionDate = nullableText(row, "decision_date");
  const context = nullableText(row, "context");
  const decision = nullableText(row, "decision");
  const consequences = nullableText(row, "consequences");
  const falsifier = nullableText(row, "falsifier");
  const initialReviewDate = nullableText(row, "initial_review_date");
  return {
    id: text(row, "id"),
    userId: text(row, "user_id"),
    ...(quarterId === null ? {} : { quarterId }),
    ...(relatedTaskId === null ? {} : { relatedTaskId }),
    ...(supersedesDecisionId === null ? {} : { supersedesDecisionId }),
    title: text(row, "title"),
    ...(decisionDate === null ? {} : { decisionDate }),
    status: text(row, "status") as DecisionRecord["status"],
    ...(context === null ? {} : { context }),
    constraints: decodeJson(text(row, "constraints_json"), "decision_records.constraints_json"),
    options: decodeJson(text(row, "options_json"), "decision_records.options_json"),
    ...(decision === null ? {} : { decision }),
    ...(consequences === null ? {} : { consequences }),
    assumptions: decodeJson(text(row, "assumptions_json"), "decision_records.assumptions_json"),
    ...(falsifier === null ? {} : { falsifier }),
    ...(initialReviewDate === null ? {} : { initialReviewDate }),
    createdAt: text(row, "created_at"),
    updatedAt: text(row, "updated_at"),
  };
}

// --- decision reviews ---

export function decisionReviewToRow(record: DecisionReviewRecord): RowParams {
  return {
    id: record.id,
    decision_id: record.decisionId,
    sequence: record.sequence,
    reviewed_at: record.reviewedAt,
    time_zone_at_review: record.timeZoneAtReview,
    outcome: record.outcome,
    notes: record.notes ?? null,
    next_review_date: record.nextReviewDate ?? null,
    replacement_decision_id: record.replacementDecisionId ?? null,
    created_at: record.createdAt,
  };
}

export function rowToDecisionReview(row: Row): DecisionReviewRecord {
  const notes = nullableText(row, "notes");
  const nextReviewDate = nullableText(row, "next_review_date");
  const replacementDecisionId = nullableText(row, "replacement_decision_id");
  return {
    id: text(row, "id"),
    decisionId: text(row, "decision_id"),
    sequence: integer(row, "sequence"),
    reviewedAt: text(row, "reviewed_at"),
    timeZoneAtReview: text(row, "time_zone_at_review"),
    outcome: text(row, "outcome") as DecisionReviewRecord["outcome"],
    ...(notes === null ? {} : { notes }),
    ...(nextReviewDate === null ? {} : { nextReviewDate }),
    ...(replacementDecisionId === null ? {} : { replacementDecisionId }),
    createdAt: text(row, "created_at"),
  };
}

// --- legacy AI reviews (read-only compat; adapter preserves, app never writes) ---

export function aiReviewToRow(record: LegacyAIReviewRecord): RowParams {
  return {
    id: record.id,
    user_id: record.userId,
    target_type: record.targetType,
    target_id: record.targetId,
    provider: record.provider,
    model: record.model ?? null,
    summary: record.summary ?? null,
    strengths_json: encodeJson(record.strengths),
    gaps_json: encodeJson(record.gaps),
    suggested_follow_up: record.suggestedFollowUp ?? null,
    questions_json: encodeJson(record.questions),
    generated_at: record.generatedAt,
    time_zone_at_generation: record.timeZoneAtGeneration,
  };
}

export function rowToAiReview(row: Row): LegacyAIReviewRecord {
  const model = nullableText(row, "model");
  const summary = nullableText(row, "summary");
  const suggestedFollowUp = nullableText(row, "suggested_follow_up");
  return {
    id: text(row, "id"),
    userId: text(row, "user_id"),
    targetType: text(row, "target_type") as LegacyAIReviewRecord["targetType"],
    targetId: text(row, "target_id"),
    provider: text(row, "provider"),
    ...(model === null ? {} : { model }),
    ...(summary === null ? {} : { summary }),
    strengths: decodeJson(text(row, "strengths_json"), "ai_reviews_legacy.strengths_json"),
    gaps: decodeJson(text(row, "gaps_json"), "ai_reviews_legacy.gaps_json"),
    ...(suggestedFollowUp === null ? {} : { suggestedFollowUp }),
    questions: decodeJson(text(row, "questions_json"), "ai_reviews_legacy.questions_json"),
    generatedAt: text(row, "generated_at"),
    timeZoneAtGeneration: text(row, "time_zone_at_generation"),
  };
}

// --- command receipts (map key is `${userId}:${key}`) ---

export function receiptMapKey(userId: string, key: string): string {
  return `${userId}:${key}`;
}

export function receiptToRow(record: CommandReceipt): RowParams {
  return {
    user_id: record.userId,
    key: record.key,
    method: record.method,
    route: record.route,
    request_fingerprint: record.requestFingerprint,
    result_json: encodeJson(record.result),
    committed_store_revision: record.committedStoreRevision,
    created_at: record.createdAt,
  };
}

export function rowToReceipt(row: Row): CommandReceipt {
  return {
    userId: text(row, "user_id"),
    key: text(row, "key"),
    method: text(row, "method"),
    route: text(row, "route"),
    requestFingerprint: text(row, "request_fingerprint"),
    result: decodeJson(text(row, "result_json"), "command_receipts.result_json"),
    committedStoreRevision: integer(row, "committed_store_revision"),
    createdAt: text(row, "created_at"),
  };
}
