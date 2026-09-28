export {
  CommandReceiptSchema,
  DailyReviewRecordSchema,
  JourneyEntryRecordSchema,
  FocusAreaRecordSchema,
  MilestoneIntentSnapshotSchema,
  MilestoneRecordSchema,
  QuarterIntentSnapshotSchema,
  QuarterRecordSchema,
  SessionRecordSchema,
  TaskLifecycleEventRecordSchema,
  TaskPlanSnapshotSchema,
  TaskRecordSchema,
  UserRecordSchema,
  type CommandReceipt,
  type DailyReviewRecord,
  type JourneyEntryRecord,
  type FocusAreaRecord,
  type MilestoneIntentSnapshot,
  type MilestoneRecord,
  type QuarterIntentSnapshot,
  type QuarterRecord,
  type SessionRecord,
  type TaskLifecycleEventRecord,
  type TaskPlanSnapshot,
  type TaskRecord,
  type UserRecord,
} from "./journey-records.js";
export { JourneyStateSchema, type JourneyState } from "./journey-state-schema.js";
export { projectTaskStatus, validateJourneyState } from "./journey-state-validation.js";

import type { JourneyState } from "./journey-state-schema.js";

export function createNoHistorySeed(writtenAt: string): JourneyState {
  return {
    schemaVersion: 1,
    storeRevision: 0,
    writtenAt,
    records: {
      users: {
        "local-user": {
          id: "local-user",
          name: "Ali",
          timeZone: "Europe/Amsterdam",
          createdAt: writtenAt,
        },
      },
      quarters: {},
      focusAreas: {},
      milestones: {},
      tasks: {},
      sessions: {},
      taskLifecycleEvents: {},
      dailyReviews: {},
      journeyEntries: {},
      decisionRecords: {},
      decisionReviews: {},
      aiReviews: {},
    },
    commandReceipts: {},
  };
}
