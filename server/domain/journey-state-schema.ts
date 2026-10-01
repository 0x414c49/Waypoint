import { Type, type Static, type TSchema } from "@sinclair/typebox";
import {
  CommandReceiptSchema,
  LegacyAIReviewRecordSchema,
  DailyReviewRecordSchema,
  DecisionRecordSchema,
  DecisionReviewRecordSchema,
  FocusAreaRecordSchema,
  MilestoneRecordSchema,
  QuarterRecordSchema,
  RecordIdSchema,
  SessionRecordSchema,
  TaskLifecycleEventRecordSchema,
  TaskRecordSchema,
  UtcInstantSchema,
  UserRecordSchema,
  JourneyEntryRecordSchema,
  AccountRecordSchema,
  AuthInviteRecordSchema,
  AuthSessionRecordSchema,
  MediaRecordSchema,
} from "./journey-records.js";

const recordMap = <T extends TSchema>(schema: T) => Type.Record(RecordIdSchema, schema);

export const JourneyStateSchema = Type.Object({
  schemaVersion: Type.Literal(1),
  storeRevision: Type.Integer({ minimum: 0 }),
  writtenAt: UtcInstantSchema,
  records: Type.Object({
    users: recordMap(UserRecordSchema),
    accounts: Type.Optional(recordMap(AccountRecordSchema)),
    authInvites: Type.Optional(recordMap(AuthInviteRecordSchema)),
    authSessions: Type.Optional(recordMap(AuthSessionRecordSchema)),
    mediaRecords: Type.Optional(recordMap(MediaRecordSchema)),
    quarters: recordMap(QuarterRecordSchema),
    focusAreas: recordMap(FocusAreaRecordSchema),
    milestones: recordMap(MilestoneRecordSchema),
    tasks: recordMap(TaskRecordSchema),
    sessions: recordMap(SessionRecordSchema),
    taskLifecycleEvents: recordMap(TaskLifecycleEventRecordSchema),
    dailyReviews: recordMap(DailyReviewRecordSchema),
    journeyEntries: recordMap(JourneyEntryRecordSchema),
    decisionRecords: recordMap(DecisionRecordSchema),
    decisionReviews: recordMap(DecisionReviewRecordSchema),
    // Retain historical records as inert persistence compatibility only.
    aiReviews: recordMap(LegacyAIReviewRecordSchema),
  }, { additionalProperties: false }),
  commandReceipts: Type.Record(Type.String({ minLength: 1 }), CommandReceiptSchema),
}, { additionalProperties: false, $id: "JourneyState" });

export type JourneyState = Static<typeof JourneyStateSchema>;
