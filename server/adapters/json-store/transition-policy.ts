import type { JourneyState } from "../../domain/journey-state.js";
import type { TransactionIntent } from "../../ports/journey-store.js";
import { StoreError } from "./errors.js";
import { equalJson } from "./state-codec.js";

const planCollections = new Set<keyof JourneyState["records"]>([
  "quarters",
  "focusAreas",
  "milestones",
  "tasks",
]);

const executionCollections = new Set<keyof JourneyState["records"]>([
  "sessions",
  "taskLifecycleEvents",
  "dailyReviews",
  "journeyEntries",
  "decisionRecords",
  "decisionReviews",
  "aiReviews",
]);

export function assertJourneyStateTransition(
  before: JourneyState,
  after: JourneyState,
  intent: TransactionIntent,
): void {
  if (intent.kind !== "SCHEMA_MIGRATION" && !equalJson(before.records.users, after.records.users)) {
    throw new StoreError(
      "STORE_WRITE_FAILED",
      "The seeded local user cannot be changed by Slice 0 transactions.",
    );
  }

  if (after.schemaVersion !== before.schemaVersion) {
    if (
      intent.kind !== "SCHEMA_MIGRATION" ||
      intent.fromVersion !== before.schemaVersion ||
      intent.toVersion !== after.schemaVersion
    ) {
      throw new StoreError("STORE_WRITE_FAILED", "Schema changes require migration authority.");
    }
  }

  const collections = Object.keys(before.records) as Array<keyof JourneyState["records"]>;
  for (const collectionName of collections) {
    const oldCollection = before.records[collectionName];
    const newCollection = after.records[collectionName];

    if (
      intent.kind === "PLAN_APPLY" &&
      executionCollections.has(collectionName) &&
      !equalJson(oldCollection, newCollection)
    ) {
      throw new StoreError(
        "STORE_WRITE_FAILED",
        "Plan application cannot change execution or history records.",
      );
    }

    if (intent.kind === "STANDARD" && planCollections.has(collectionName)) {
      for (const [id, record] of Object.entries(oldCollection)) {
        if (id in newCollection && !equalJson(record, newCollection[id])) {
          throw new StoreError(
            "STORE_WRITE_FAILED",
            "Existing plan-owned records can change only during plan application.",
          );
        }
      }
    }

    for (const id of Object.keys(oldCollection)) {
      if (id in newCollection) continue;
      const exactJourneyDeletion =
        intent.kind === "JOURNEY_DELETE" &&
        collectionName === "journeyEntries" &&
        intent.journeyEntryId === id;
      const planDeletion = intent.kind === "PLAN_APPLY" && planCollections.has(collectionName);
      const migrationDeletion = intent.kind === "SCHEMA_MIGRATION";
      if (!exactJourneyDeletion && !planDeletion && !migrationDeletion) {
        throw new StoreError("STORE_WRITE_FAILED", "History cannot be deleted by this transaction.");
      }
    }
  }
}
