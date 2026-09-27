import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { CurrentUserSchema } from "../../shared/contracts/current-user.js";

const StoredRecordSchema = Type.Object(
  { id: Type.String({ minLength: 1 }) },
  { additionalProperties: true },
);

const RecordMapSchema = Type.Record(Type.String({ minLength: 1 }), StoredRecordSchema);

export const JourneyStateSchema = Type.Object(
  {
    schemaVersion: Type.Literal(1),
    storeRevision: Type.Integer({ minimum: 0 }),
    writtenAt: Type.String({ minLength: 20 }),
    records: Type.Object(
      {
        users: Type.Record(Type.String({ minLength: 1 }), CurrentUserSchema),
        quarters: RecordMapSchema,
        focusAreas: RecordMapSchema,
        milestones: RecordMapSchema,
        tasks: RecordMapSchema,
        sessions: RecordMapSchema,
        taskLifecycleEvents: RecordMapSchema,
        dailyReviews: RecordMapSchema,
        journeyEntries: RecordMapSchema,
        decisionRecords: RecordMapSchema,
        decisionReviews: RecordMapSchema,
        aiReviews: RecordMapSchema,
      },
      { additionalProperties: false },
    ),
    commandReceipts: Type.Record(
      Type.String({ minLength: 1 }),
      Type.Object(
        {
          userId: Type.String({ minLength: 1 }),
          key: Type.String({ minLength: 1 }),
          method: Type.String({ minLength: 1 }),
          route: Type.String({ minLength: 1 }),
          requestFingerprint: Type.String({ minLength: 1 }),
          result: Type.Object(
            {
              outcomeKind: Type.String({ minLength: 1 }),
              createdRecordIds: Type.Array(Type.String({ minLength: 1 })),
              affectedRecordIds: Type.Array(Type.String({ minLength: 1 })),
              outcomeFacts: Type.Record(Type.String(), Type.Unknown()),
            },
            { additionalProperties: false },
          ),
          committedStoreRevision: Type.Integer({ minimum: 1 }),
          createdAt: Type.String({ minLength: 20 }),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false, $id: "JourneyState" },
);

export type JourneyState = Static<typeof JourneyStateSchema>;

const collectionNames = [
  "users",
  "quarters",
  "focusAreas",
  "milestones",
  "tasks",
  "sessions",
  "taskLifecycleEvents",
  "dailyReviews",
  "journeyEntries",
  "decisionRecords",
  "decisionReviews",
  "aiReviews",
] as const;

function isUtcInstant(value: string): boolean {
  const date = new Date(value);
  return !Number.isNaN(date.valueOf()) && date.toISOString() === value;
}

function isIanaTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function validateJourneyState(value: unknown): string[] {
  const errors = [...Value.Errors(JourneyStateSchema, value)].map(
    (error) => `${error.path || "/"}: ${error.message}`,
  );

  if (!Value.Check(JourneyStateSchema, value)) return errors;

  const state = value as JourneyState;
  if (!isUtcInstant(state.writtenAt)) {
    errors.push("/writtenAt: expected a normalized UTC instant");
  }

  for (const [key, user] of Object.entries(state.records.users)) {
    if (key !== user.id) errors.push(`/records/users/${key}: map key must equal id`);
    if (!isUtcInstant(user.createdAt)) {
      errors.push(`/records/users/${key}/createdAt: expected a normalized UTC instant`);
    }
    if (!isIanaTimeZone(user.timeZone)) {
      errors.push(`/records/users/${key}/timeZone: expected an IANA time zone`);
    }
  }

  for (const [key, receipt] of Object.entries(state.commandReceipts)) {
    if (!state.records.users[receipt.userId]) {
      errors.push(`/commandReceipts/${key}/userId: referenced user does not exist`);
    }
    if (!isUtcInstant(receipt.createdAt)) {
      errors.push(`/commandReceipts/${key}/createdAt: expected a normalized UTC instant`);
    }
    if (receipt.committedStoreRevision > state.storeRevision) {
      errors.push(`/commandReceipts/${key}: committed revision is in the future`);
    }
  }

  for (const collectionName of collectionNames.slice(1)) {
    const collection = state.records[collectionName];
    for (const [key, record] of Object.entries(collection)) {
      if (key !== record.id) {
        errors.push(`/records/${collectionName}/${key}: map key must equal id`);
      }
      errors.push(
        `/records/${collectionName}/${key}: ${collectionName} records are not enabled in Slice 0`,
      );
    }
  }

  return errors;
}

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
