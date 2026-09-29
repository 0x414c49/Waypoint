import { Type, type Static, type TSchema } from "@sinclair/typebox";
import {
  CommandReceiptSchema,
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
} from "./journey-records.js";

const recordMap = <T extends TSchema>(schema: T) => Type.Record(RecordIdSchema, schema);
const laterSliceRecord = Type.Object({ id: RecordIdSchema }, { additionalProperties: true });

export const JourneyStateSchema = Type.Object({
  schemaVersion: Type.Literal(1),
  storeRevision: Type.Integer({ minimum: 0 }),
  writtenAt: UtcInstantSchema,
  records: Type.Object({
    users: recordMap(UserRecordSchema),
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
    aiReviews: recordMap(laterSliceRecord),
  }, { additionalProperties: false }),
  commandReceipts: Type.Record(Type.String({ minLength: 1 }), CommandReceiptSchema),
}, { additionalProperties: false, $id: "JourneyState" });

export type JourneyState = Static<typeof JourneyStateSchema>;
