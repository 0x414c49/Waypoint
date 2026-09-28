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
