import { Type, type Static } from "@sinclair/typebox";

export const RecordIdSchema = Type.String({
  minLength: 1,
  maxLength: 128,
  pattern: "^[a-z0-9][a-z0-9._-]*$",
});
const title = Type.String({ minLength: 1, maxLength: 200 });
const longText = Type.String({ minLength: 1, maxLength: 20_000 });
const date = Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });
export const UtcInstantSchema = Type.String({ minLength: 20 });
const position = Type.Integer({ minimum: 0 });
const positiveMinutes = Type.Integer({ minimum: 1 });
const criterion = Type.Object(
  { id: RecordIdSchema, text: longText, position },
  { additionalProperties: false },
);
const milestoneMode = Type.Union([
  Type.Literal("STANDARD"), Type.Literal("LIGHT"), Type.Literal("BUFFER"), Type.Literal("RETRO"),
]);
const recommendationMode = Type.Union([
  Type.Literal("DEFAULT"), Type.Literal("WHEN_CLEAR"), Type.Literal("OPTIONAL"),
]);
const decisionPrompt = Type.Object({
  decisionId: RecordIdSchema,
  suggestedTitle: title,
  initialReviewDate: Type.Optional(date),
}, { additionalProperties: false });

export const UserRecordSchema = Type.Object({
  id: RecordIdSchema,
  name: Type.String({ minLength: 1, maxLength: 120 }),
  timeZone: Type.String({ minLength: 1, maxLength: 100 }),
  createdAt: UtcInstantSchema,
}, { additionalProperties: false });
export type UserRecord = Static<typeof UserRecordSchema>;

export const AuthRoleSchema = Type.Union([Type.Literal("OWNER"), Type.Literal("MEMBER")]);
export type AuthRole = Static<typeof AuthRoleSchema>;
export const PasswordVerifierSchema = Type.Object({
  algorithm: Type.Literal("scrypt"), version: Type.Integer({ minimum: 1 }),
  N: Type.Integer({ minimum: 2 }), r: Type.Integer({ minimum: 1 }), p: Type.Integer({ minimum: 1 }),
  maxmem: Type.Integer({ minimum: 1 }), salt: Type.String({ minLength: 22, maxLength: 256 }),
  derivedKey: Type.String({ minLength: 80, maxLength: 256 }),
}, { additionalProperties: false });
export type PasswordVerifier = Static<typeof PasswordVerifierSchema>;
export const TotpSecretCipherSchema = Type.Object({
  algorithm: Type.Literal("aes-256-gcm"), version: Type.Literal(1),
  iv: Type.String({ minLength: 16, maxLength: 24 }), authTag: Type.String({ minLength: 20, maxLength: 32 }),
  ciphertext: Type.String({ minLength: 40, maxLength: 64 }),
}, { additionalProperties: false });
export type TotpSecretCipher = Static<typeof TotpSecretCipherSchema>;
export const AccountRecordSchema = Type.Object({
  id: RecordIdSchema, userId: RecordIdSchema, email: Type.String({ minLength: 3, maxLength: 320 }),
  role: AuthRoleSchema, passwordVerifier: PasswordVerifierSchema,
  totpSecretCipher: Type.Optional(TotpSecretCipherSchema), lastTotpStep: Type.Optional(Type.Integer({ minimum: 0 })),
  createdAt: UtcInstantSchema, updatedAt: UtcInstantSchema, disabledAt: Type.Optional(UtcInstantSchema),
}, { additionalProperties: false });
export type AccountRecord = Static<typeof AccountRecordSchema>;
export const AuthInviteRecordSchema = Type.Object({
  id: Type.String({ minLength: 64, maxLength: 64, pattern: "^[a-f0-9]+$" }),
  intendedEmail: Type.String({ minLength: 3, maxLength: 320 }), role: AuthRoleSchema,
  createdByUserId: Type.Optional(RecordIdSchema), bootstrap: Type.Boolean(),
  legacyUserId: Type.Optional(RecordIdSchema), createdAt: UtcInstantSchema, expiresAt: UtcInstantSchema,
  consumedAt: Type.Optional(UtcInstantSchema), consumedByUserId: Type.Optional(RecordIdSchema), revokedAt: Type.Optional(UtcInstantSchema),
}, { additionalProperties: false });
export type AuthInviteRecord = Static<typeof AuthInviteRecordSchema>;
export const AuthSessionRecordSchema = Type.Object({
  id: Type.String({ minLength: 64, maxLength: 64, pattern: "^[a-f0-9]+$" }), accountId: RecordIdSchema, userId: RecordIdSchema,
  createdAt: UtcInstantSchema, lastSeenAt: UtcInstantSchema, expiresAt: UtcInstantSchema, revokedAt: Type.Optional(UtcInstantSchema),
}, { additionalProperties: false });
export type AuthSessionRecord = Static<typeof AuthSessionRecordSchema>;
export const MediaRecordSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 256 }), filename: Type.String({ minLength: 1, maxLength: 256 }), userId: RecordIdSchema,
  mediaType: Type.Union([Type.Literal("image/png"), Type.Literal("image/jpeg"), Type.Literal("image/gif"), Type.Literal("image/webp")]),
  byteLength: Type.Integer({ minimum: 1 }), createdAt: UtcInstantSchema,
}, { additionalProperties: false });
export type MediaRecord = Static<typeof MediaRecordSchema>;
export const EmailPreferenceRecordSchema = Type.Object({
  id: RecordIdSchema, userId: RecordIdSchema,
  digestUnsubscribedAt: Type.Optional(UtcInstantSchema), updatedAt: UtcInstantSchema,
}, { additionalProperties: false });
export type EmailPreferenceRecord = Static<typeof EmailPreferenceRecordSchema>;

export const QuarterIntentSnapshotSchema = Type.Object({
  capturedAt: UtcInstantSchema,
  planRevision: Type.Integer({ minimum: 1 }),
  timeZoneAtCapture: Type.String({ minLength: 1, maxLength: 100 }),
  title,
  description: Type.Optional(longText),
  mantra: Type.Optional(longText),
  startDate: date,
  endDate: date,
  successCriteria: Type.Array(criterion, { maxItems: 100 }),
  focusAreas: Type.Array(Type.Object({
    id: RecordIdSchema,
    name: title,
    targetMinutes: Type.Optional(positiveMinutes),
  }, { additionalProperties: false }), { maxItems: 50 }),
}, { additionalProperties: false });
export type QuarterIntentSnapshot = Static<typeof QuarterIntentSnapshotSchema>;

export const MilestoneIntentSnapshotSchema = Type.Object({
  capturedAt: UtcInstantSchema,
  planRevision: Type.Integer({ minimum: 1 }),
  timeZoneAtCapture: Type.String({ minLength: 1, maxLength: 100 }),
  title,
  description: Type.Optional(longText),
  startDate: date,
  endDate: date,
  mode: milestoneMode,
  position,
}, { additionalProperties: false });
export type MilestoneIntentSnapshot = Static<typeof MilestoneIntentSnapshotSchema>;

export const TaskPlanSnapshotSchema = Type.Object({
  capturedAt: UtcInstantSchema,
  planRevision: Type.Integer({ minimum: 1 }),
  focusAreaId: Type.Optional(RecordIdSchema),
  focusAreaName: Type.Optional(title),
  milestoneId: Type.Optional(RecordIdSchema),
  milestoneTitle: Type.Optional(title),
  plannedDate: date,
  title,
  description: Type.Optional(longText),
  plannedMinutes: Type.Optional(positiveMinutes),
  tags: Type.Array(Type.String({ minLength: 1, maxLength: 64 }), { maxItems: 20 }),
  recommendationMode,
  decisionPrompt: Type.Optional(decisionPrompt),
}, { additionalProperties: false });
export type TaskPlanSnapshot = Static<typeof TaskPlanSnapshotSchema>;

export const QuarterRecordSchema = Type.Object({
  id: RecordIdSchema,
  userId: RecordIdSchema,
  title,
  description: Type.Optional(longText),
  mantra: Type.Optional(longText),
  startDate: date,
  endDate: date,
  successCriteria: Type.Array(criterion, { maxItems: 100 }),
  planRevision: Type.Integer({ minimum: 1 }),
  lastPlanImportedAt: Type.Optional(UtcInstantSchema),
  intentSnapshot: Type.Optional(QuarterIntentSnapshotSchema),
  createdAt: UtcInstantSchema,
  updatedAt: UtcInstantSchema,
}, { additionalProperties: false });
export type QuarterRecord = Static<typeof QuarterRecordSchema>;

export const FocusAreaRecordSchema = Type.Object({
  id: RecordIdSchema,
  quarterId: RecordIdSchema,
  name: title,
  description: Type.Optional(longText),
  targetMinutes: Type.Optional(positiveMinutes),
  position,
  createdAt: UtcInstantSchema,
  updatedAt: UtcInstantSchema,
  removedFromPlanAt: Type.Optional(UtcInstantSchema),
}, { additionalProperties: false });
export type FocusAreaRecord = Static<typeof FocusAreaRecordSchema>;

export const MilestoneRecordSchema = Type.Object({
  id: RecordIdSchema,
  quarterId: RecordIdSchema,
  title,
  description: Type.Optional(longText),
  startDate: date,
  endDate: date,
  mode: milestoneMode,
  position,
  intentSnapshot: Type.Optional(MilestoneIntentSnapshotSchema),
  createdAt: UtcInstantSchema,
  updatedAt: UtcInstantSchema,
  removedFromPlanAt: Type.Optional(UtcInstantSchema),
}, { additionalProperties: false });
export type MilestoneRecord = Static<typeof MilestoneRecordSchema>;

export const TaskRecordSchema = Type.Object({
  id: RecordIdSchema,
  quarterId: RecordIdSchema,
  focusAreaId: Type.Optional(RecordIdSchema),
  milestoneId: Type.Optional(RecordIdSchema),
  plannedDate: date,
  title,
  description: Type.Optional(longText),
  plannedMinutes: Type.Optional(positiveMinutes),
  tags: Type.Array(Type.String({ minLength: 1, maxLength: 64 }), { maxItems: 20 }),
  position,
  recommendationMode,
  decisionPrompt: Type.Optional(decisionPrompt),
  removedFromPlanAt: Type.Optional(UtcInstantSchema),
  status: Type.Union([
    Type.Literal("NOT_STARTED"), Type.Literal("IN_PROGRESS"), Type.Literal("PAUSED"),
    Type.Literal("FINISHED"), Type.Literal("SKIPPED"),
  ]),
  planSnapshot: Type.Optional(TaskPlanSnapshotSchema),
  continuationOfTaskId: Type.Optional(RecordIdSchema),
  createdAt: UtcInstantSchema,
  updatedAt: UtcInstantSchema,
}, { additionalProperties: false });
export type TaskRecord = Static<typeof TaskRecordSchema>;

export const SessionRecordSchema = Type.Object({
  id: RecordIdSchema,
  taskId: RecordIdSchema,
  startedAt: UtcInstantSchema,
  endedAt: Type.Optional(UtcInstantSchema),
  timeZoneAtStart: Type.String({ minLength: 1, maxLength: 100 }),
  intentionMinutes: Type.Optional(Type.Literal(10)),
  createdAt: UtcInstantSchema,
  updatedAt: UtcInstantSchema,
  correctedAt: Type.Optional(UtcInstantSchema),
}, { additionalProperties: false });
export type SessionRecord = Static<typeof SessionRecordSchema>;

export const TaskLifecycleEventRecordSchema = Type.Object({
  id: RecordIdSchema,
  taskId: RecordIdSchema,
  sequence: Type.Integer({ minimum: 1 }),
  type: Type.Union([
    Type.Literal("FINISHED"), Type.Literal("SKIPPED"), Type.Literal("REOPENED"), Type.Literal("CARRIED_FORWARD"),
  ]),
  occurredAt: UtcInstantSchema,
  timeZoneAtOccurrence: Type.String({ minLength: 1, maxLength: 100 }),
  relatedTaskId: Type.Optional(RecordIdSchema),
  undoesEventId: Type.Optional(RecordIdSchema),
  createdAt: UtcInstantSchema,
}, { additionalProperties: false });
export type TaskLifecycleEventRecord = Static<typeof TaskLifecycleEventRecordSchema>;

export const DailyReviewRecordSchema = Type.Object({
  id: RecordIdSchema,
  taskId: RecordIdSchema,
  finishEventId: RecordIdSchema,
  outcome: Type.Union([Type.Literal("ACHIEVED"), Type.Literal("PARTIAL"), Type.Literal("NOT_ACHIEVED")]),
  keyLearning: Type.Optional(Type.String({ minLength: 1, maxLength: 2_000 })),
  reflection: Type.Optional(longText),
  createdAt: UtcInstantSchema,
  updatedAt: UtcInstantSchema,
}, { additionalProperties: false });
export type DailyReviewRecord = Static<typeof DailyReviewRecordSchema>;

export const JourneyEntryRecordSchema = Type.Object({
  id: RecordIdSchema,
  userId: RecordIdSchema,
  occurredAt: UtcInstantSchema,
  timeZoneAtOccurrence: Type.String({ minLength: 1, maxLength: 100 }),
  text: longText,
  tags: Type.Array(Type.String({ minLength: 1, maxLength: 64 }), { maxItems: 20 }),
  relatedTaskId: Type.Optional(RecordIdSchema),
  relatedMilestoneId: Type.Optional(RecordIdSchema),
  relatedDecisionId: Type.Optional(RecordIdSchema),
  changedMyMind: Type.Boolean(),
  feeling: Type.Optional(Type.Union([
    Type.Literal("curious"), Type.Literal("steady"), Type.Literal("stuck"),
    Type.Literal("uncertain"), Type.Literal("proud"), Type.Literal("tired"),
  ])),
  createdAt: UtcInstantSchema,
  updatedAt: Type.Optional(UtcInstantSchema),
}, { additionalProperties: false });
export type JourneyEntryRecord = Static<typeof JourneyEntryRecordSchema>;

export const DecisionStatusSchema = Type.Union([
  Type.Literal("DRAFT"), Type.Literal("ACCEPTED"), Type.Literal("SUPERSEDED"),
]);
export const DecisionReviewOutcomeSchema = Type.Union([
  Type.Literal("HOLDS"), Type.Literal("ADJUST"), Type.Literal("SUPERSEDE"), Type.Literal("DEFERRED"),
]);
export const DecisionOptionRecordSchema = Type.Object({
  id: RecordIdSchema,
  title,
  description: longText,
  strengths: Type.Array(longText, { maxItems: 20 }),
  weaknesses: Type.Array(longText, { maxItems: 20 }),
}, { additionalProperties: false });
export type DecisionOptionRecord = Static<typeof DecisionOptionRecordSchema>;

export const DecisionRecordSchema = Type.Object({
  id: RecordIdSchema,
  userId: RecordIdSchema,
  quarterId: Type.Optional(RecordIdSchema),
  relatedTaskId: Type.Optional(RecordIdSchema),
  supersedesDecisionId: Type.Optional(RecordIdSchema),
  title,
  decisionDate: Type.Optional(date),
  status: DecisionStatusSchema,
  context: Type.Optional(longText),
  constraints: Type.Array(longText, { maxItems: 20 }),
  options: Type.Array(DecisionOptionRecordSchema, { maxItems: 20 }),
  decision: Type.Optional(longText),
  consequences: Type.Optional(longText),
  assumptions: Type.Array(longText, { maxItems: 20 }),
  falsifier: Type.Optional(longText),
  initialReviewDate: Type.Optional(date),
  createdAt: UtcInstantSchema,
  updatedAt: UtcInstantSchema,
}, { additionalProperties: false });
export type DecisionRecord = Static<typeof DecisionRecordSchema>;

export const DecisionReviewRecordSchema = Type.Object({
  id: RecordIdSchema,
  decisionId: RecordIdSchema,
  sequence: Type.Integer({ minimum: 1 }),
  reviewedAt: UtcInstantSchema,
  timeZoneAtReview: Type.String({ minLength: 1, maxLength: 100 }),
  outcome: DecisionReviewOutcomeSchema,
  notes: Type.Optional(longText),
  nextReviewDate: Type.Optional(date),
  replacementDecisionId: Type.Optional(RecordIdSchema),
  createdAt: UtcInstantSchema,
}, { additionalProperties: false });
export type DecisionReviewRecord = Static<typeof DecisionReviewRecordSchema>;

// Read-only compatibility for AIReview entries written by an earlier build.
// The application no longer exposes a creation, listing, or generation path.
export const LegacyAIReviewTargetTypeSchema = Type.Union([
  Type.Literal("TASK"), Type.Literal("WEEK"), Type.Literal("QUARTER"), Type.Literal("DECISION"),
]);
export const LegacyAIReviewRecordSchema = Type.Object({
  id: RecordIdSchema,
  userId: RecordIdSchema,
  targetType: LegacyAIReviewTargetTypeSchema,
  targetId: RecordIdSchema,
  provider: Type.String({ minLength: 1, maxLength: 80 }),
  model: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
  summary: Type.Optional(longText),
  strengths: Type.Array(longText, { maxItems: 20 }),
  gaps: Type.Array(longText, { maxItems: 20 }),
  suggestedFollowUp: Type.Optional(longText),
  questions: Type.Array(longText, { maxItems: 20 }),
  generatedAt: UtcInstantSchema,
  timeZoneAtGeneration: Type.String({ minLength: 1, maxLength: 100 }),
}, { additionalProperties: false });

export const CommandReceiptSchema = Type.Object({
  userId: RecordIdSchema,
  key: Type.String({ minLength: 1, maxLength: 128, pattern: "^[A-Za-z0-9._:-]+$" }),
  method: Type.String({ minLength: 1, maxLength: 16 }),
  route: Type.String({ minLength: 1, maxLength: 500 }),
  requestFingerprint: Type.String({ minLength: 1, maxLength: 512 }),
  result: Type.Object({
    outcomeKind: Type.String({ minLength: 1, maxLength: 100 }),
    createdRecordIds: Type.Array(RecordIdSchema),
    affectedRecordIds: Type.Array(RecordIdSchema),
    outcomeFacts: Type.Record(Type.String(), Type.Unknown()),
  }, { additionalProperties: false }),
  committedStoreRevision: Type.Integer({ minimum: 1 }),
  createdAt: UtcInstantSchema,
}, { additionalProperties: false });
export type CommandReceipt = Static<typeof CommandReceiptSchema>;
