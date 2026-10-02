import type { JourneyState } from "../domain/journey-state.js";
import type { TransactionIntent } from "../ports/journey-store.js";
import { StoreError } from "./store-errors.js";
import { equalJson } from "./state-codec.js";

const executionCollections = new Set<keyof JourneyState["records"]>([
  "sessions",
  "taskLifecycleEvents",
  "dailyReviews",
  "journeyEntries",
  "decisionRecords",
  "decisionReviews",
  "aiReviews",
]);
const authCollections = new Set<keyof JourneyState["records"]>([
  "users", "accounts", "authInvites", "authSessions",
]);

function fields(record: Record<string, unknown>, names: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(names.map((name) => [name, record[name]]));
}

const quarterPlanFields = [
  "id", "userId", "title", "description", "mantra", "startDate", "endDate",
  "successCriteria", "planRevision", "lastPlanImportedAt", "createdAt", "updatedAt",
] as const;
const milestonePlanFields = [
  "id", "quarterId", "title", "description", "startDate", "endDate", "mode", "position",
  "createdAt", "updatedAt", "removedFromPlanAt",
] as const;
const taskPlanFields = [
  "id", "quarterId", "focusAreaId", "milestoneId", "plannedDate", "title", "description",
  "plannedMinutes", "tags", "position", "recommendationMode", "decisionPrompt",
  "removedFromPlanAt", "createdAt",
] as const;
const taskExecutionFields = ["status", "planSnapshot", "continuationOfTaskId"] as const;

function canDeletePlanRecord(
  before: JourneyState,
  after: JourneyState,
  collectionName: "quarters" | "focusAreas" | "milestones" | "tasks",
  id: string,
): boolean {
  if (collectionName === "tasks") {
    const task = before.records.tasks[id];
    if (!task || task.status !== "NOT_STARTED" || task.planSnapshot || task.continuationOfTaskId) return false;
    return (
      !Object.values(before.records.sessions).some((record) => record.taskId === id) &&
      !Object.values(before.records.taskLifecycleEvents).some((record) => record.taskId === id) &&
      !Object.values(before.records.dailyReviews).some((record) => record.taskId === id) &&
      !Object.values(before.records.journeyEntries).some((record) => record.relatedTaskId === id) &&
      !Object.values(before.records.decisionRecords).some((record) => record.relatedTaskId === id) &&
      !Object.values(before.records.aiReviews).some((record) => { const review = record as { targetType?: unknown; targetId?: unknown }; return review.targetType === "TASK" && review.targetId === id; }) &&
      !Object.values(before.records.tasks).some((record) => record.continuationOfTaskId === id)
    );
  }
  if (collectionName === "focusAreas") {
    return !Object.values(after.records.tasks).some(
      (task) => task.focusAreaId === id || task.planSnapshot?.focusAreaId === id,
    );
  }
  if (collectionName === "milestones") {
    const milestone = before.records.milestones[id];
    return (
      !milestone?.intentSnapshot &&
      !Object.values(after.records.tasks).some(
        (task) => task.milestoneId === id || task.planSnapshot?.milestoneId === id,
      ) &&
      !Object.values(after.records.journeyEntries).some((entry) => entry.relatedMilestoneId === id) &&
      !Object.values(after.records.aiReviews).some((record) => { const review = record as { targetType?: unknown; targetId?: unknown }; return review.targetType === "WEEK" && review.targetId === id; })
    );
  }
  const quarter = before.records.quarters[id];
  return (
    !quarter?.intentSnapshot &&
    !Object.values(after.records.focusAreas).some((record) => record.quarterId === id) &&
    !Object.values(after.records.milestones).some((record) => record.quarterId === id) &&
    !Object.values(after.records.tasks).some((record) => record.quarterId === id) &&
    !Object.values(after.records.decisionRecords).some((record) => record.quarterId === id) &&
    !Object.values(after.records.aiReviews).some((record) => {
      const review = record as { targetType?: unknown; targetId?: unknown };
      return review.targetType === "QUARTER" && review.targetId === id;
    })
  );
}

export function assertJourneyStateTransition(
  before: JourneyState,
  after: JourneyState,
  intent: TransactionIntent,
): void {
  if (intent.kind === "JOURNEY_DELETE") {
    for (const collectionName of Object.keys(before.records) as Array<keyof JourneyState["records"]>) {
      if (collectionName === "journeyEntries") continue;
      if (!equalJson(before.records[collectionName], after.records[collectionName])) {
        throw new StoreError("STORE_WRITE_FAILED", "Journey deletion cannot change any other records.");
      }
    }
    if (!equalJson(before.commandReceipts, after.commandReceipts)) {
      throw new StoreError("STORE_WRITE_FAILED", "Journey deletion cannot change command receipts.");
    }
    const expectedEntries = { ...before.records.journeyEntries };
    delete expectedEntries[intent.journeyEntryId];
    if (!equalJson(expectedEntries, after.records.journeyEntries)) {
      throw new StoreError("STORE_WRITE_FAILED", "Journey deletion must remove exactly the named entry.");
    }
  }
  if (intent.kind !== "SCHEMA_MIGRATION" && intent.kind !== "AUTHENTICATION" && !equalJson(before.records.users, after.records.users)) {
    throw new StoreError(
      "STORE_WRITE_FAILED",
      "The canonical local user cannot be changed by application transactions.",
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
    const oldCollection = before.records[collectionName] ?? {};
    const newCollection = after.records[collectionName] ?? {};

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

    for (const id of Object.keys(oldCollection)) {
      if (id in newCollection) continue;
      const exactJourneyDeletion =
        intent.kind === "JOURNEY_DELETE" &&
        collectionName === "journeyEntries" &&
        intent.journeyEntryId === id;
      const planCollection =
        intent.kind === "PLAN_APPLY" &&
        (collectionName === "quarters" ||
          collectionName === "focusAreas" ||
          collectionName === "milestones" ||
          collectionName === "tasks");
      const planDeletion =
        planCollection &&
        canDeletePlanRecord(
          before,
          after,
          collectionName as "quarters" | "focusAreas" | "milestones" | "tasks",
          id,
        );
      const migrationDeletion = intent.kind === "SCHEMA_MIGRATION";
      const authMutation = intent.kind === "AUTHENTICATION" && authCollections.has(collectionName);
      if (!exactJourneyDeletion && !planDeletion && !migrationDeletion && !authMutation) {
        throw new StoreError("STORE_WRITE_FAILED", "History cannot be deleted by this transaction.");
      }
    }
  }

  if (intent.kind === "AUTHENTICATION") {
    for (const collectionName of Object.keys(before.records) as Array<keyof JourneyState["records"]>) {
      if (authCollections.has(collectionName)) continue;
      if (!equalJson(before.records[collectionName], after.records[collectionName])) {
        throw new StoreError("STORE_WRITE_FAILED", "Authentication transactions cannot change learning records.");
      }
    }
  }

  if (intent.kind === "PLAN_APPLY") {
    for (const [id, quarter] of Object.entries(after.records.quarters)) {
      if (!(id in before.records.quarters) && quarter.intentSnapshot) {
        throw new StoreError("STORE_WRITE_FAILED", "Plan application cannot create Quarter history snapshots.");
      }
    }
    for (const [id, milestone] of Object.entries(after.records.milestones)) {
      if (!(id in before.records.milestones) && milestone.intentSnapshot) {
        throw new StoreError("STORE_WRITE_FAILED", "Plan application cannot create Milestone history snapshots.");
      }
    }
    for (const [id, task] of Object.entries(after.records.tasks)) {
      if (!(id in before.records.tasks) && (
        task.status !== "NOT_STARTED" || task.planSnapshot || task.continuationOfTaskId
      )) {
        throw new StoreError("STORE_WRITE_FAILED", "Plan application can create only pristine Not started Tasks.");
      }
    }
  }

  for (const [id, oldQuarter] of Object.entries(before.records.quarters)) {
    const next = after.records.quarters[id];
    if (!next) continue;
    if (
      intent.kind !== "SCHEMA_MIGRATION" &&
      !equalJson(
        fields(oldQuarter as unknown as Record<string, unknown>, ["id", "userId", "createdAt"]),
        fields(next as unknown as Record<string, unknown>, ["id", "userId", "createdAt"]),
      )
    ) {
      throw new StoreError("STORE_WRITE_FAILED", "Quarter identity and ownership are immutable.");
    }
    if (
      intent.kind === "STANDARD" &&
      !equalJson(
        fields(oldQuarter as unknown as Record<string, unknown>, quarterPlanFields),
        fields(next as unknown as Record<string, unknown>, quarterPlanFields),
      )
    ) {
      throw new StoreError("STORE_WRITE_FAILED", "Quarter plan fields require plan authority.");
    }
    if (oldQuarter.intentSnapshot && !equalJson(oldQuarter.intentSnapshot, next.intentSnapshot)) {
      throw new StoreError("STORE_WRITE_FAILED", "Quarter history snapshots are immutable.");
    }
    if (intent.kind === "PLAN_APPLY" && !equalJson(oldQuarter.intentSnapshot, next.intentSnapshot)) {
      throw new StoreError("STORE_WRITE_FAILED", "Plan application cannot change history snapshots.");
    }
  }

  for (const [id, oldArea] of Object.entries(before.records.focusAreas)) {
    const next = after.records.focusAreas[id];
    if (
      next &&
      intent.kind !== "SCHEMA_MIGRATION" &&
      !equalJson(
        fields(oldArea as unknown as Record<string, unknown>, ["id", "quarterId", "createdAt"]),
        fields(next as unknown as Record<string, unknown>, ["id", "quarterId", "createdAt"]),
      )
    ) {
      throw new StoreError("STORE_WRITE_FAILED", "Focus-area identity and ownership are immutable.");
    }
    if (next && intent.kind === "STANDARD" && !equalJson(oldArea, next)) {
      throw new StoreError("STORE_WRITE_FAILED", "Focus-area plan fields require plan authority.");
    }
  }

  for (const [id, oldMilestone] of Object.entries(before.records.milestones)) {
    const next = after.records.milestones[id];
    if (!next) continue;
    if (
      intent.kind !== "SCHEMA_MIGRATION" &&
      !equalJson(
        fields(oldMilestone as unknown as Record<string, unknown>, ["id", "quarterId", "createdAt"]),
        fields(next as unknown as Record<string, unknown>, ["id", "quarterId", "createdAt"]),
      )
    ) {
      throw new StoreError("STORE_WRITE_FAILED", "Milestone identity and ownership are immutable.");
    }
    if (
      intent.kind === "STANDARD" &&
      !equalJson(
        fields(oldMilestone as unknown as Record<string, unknown>, milestonePlanFields),
        fields(next as unknown as Record<string, unknown>, milestonePlanFields),
      )
    ) {
      throw new StoreError("STORE_WRITE_FAILED", "Milestone plan fields require plan authority.");
    }
    if (oldMilestone.intentSnapshot && !equalJson(oldMilestone.intentSnapshot, next.intentSnapshot)) {
      throw new StoreError("STORE_WRITE_FAILED", "Milestone history snapshots are immutable.");
    }
    if (intent.kind === "PLAN_APPLY" && !equalJson(oldMilestone.intentSnapshot, next.intentSnapshot)) {
      throw new StoreError("STORE_WRITE_FAILED", "Plan application cannot change history snapshots.");
    }
  }

  for (const [id, oldTask] of Object.entries(before.records.tasks)) {
    const next = after.records.tasks[id];
    if (!next) continue;
    if (
      intent.kind !== "SCHEMA_MIGRATION" &&
      !equalJson(
        fields(oldTask as unknown as Record<string, unknown>, [
          "id",
          "quarterId",
          "createdAt",
          "continuationOfTaskId",
        ]),
        fields(next as unknown as Record<string, unknown>, [
          "id",
          "quarterId",
          "createdAt",
          "continuationOfTaskId",
        ]),
      )
    ) {
      throw new StoreError("STORE_WRITE_FAILED", "Task identity and continuation ownership are immutable.");
    }
    if (
      intent.kind === "STANDARD" &&
      !equalJson(
        fields(oldTask as unknown as Record<string, unknown>, taskPlanFields),
        fields(next as unknown as Record<string, unknown>, taskPlanFields),
      )
    ) {
      throw new StoreError("STORE_WRITE_FAILED", "Task plan fields require plan authority.");
    }
    if (oldTask.planSnapshot && !equalJson(oldTask.planSnapshot, next.planSnapshot)) {
      throw new StoreError("STORE_WRITE_FAILED", "Task plan snapshots are immutable.");
    }
    if (
      intent.kind === "PLAN_APPLY" &&
      !equalJson(
        fields(oldTask as unknown as Record<string, unknown>, taskExecutionFields),
        fields(next as unknown as Record<string, unknown>, taskExecutionFields),
      )
    ) {
      throw new StoreError("STORE_WRITE_FAILED", "Plan application cannot change Task execution fields.");
    }
  }

  for (const [id, oldSession] of Object.entries(before.records.sessions)) {
    const next = after.records.sessions[id];
    if (!next) continue;
    const permanentFields = ["id", "taskId", "timeZoneAtStart", "intentionMinutes", "createdAt"] as const;
    if (!equalJson(
      fields(oldSession as unknown as Record<string, unknown>, permanentFields),
      fields(next as unknown as Record<string, unknown>, permanentFields),
    )) throw new StoreError("STORE_WRITE_FAILED", "Session ownership and capture facts are immutable.");
    const intervalChanged = oldSession.startedAt !== next.startedAt || oldSession.endedAt !== next.endedAt;
    if (!intervalChanged) continue;
    const normalClose = oldSession.endedAt === undefined && next.endedAt !== undefined &&
      oldSession.startedAt === next.startedAt && oldSession.correctedAt === next.correctedAt;
    const correction = next.correctedAt !== undefined && next.correctedAt === next.updatedAt &&
      next.correctedAt !== oldSession.correctedAt &&
      (oldSession.endedAt === undefined ? next.endedAt === undefined : next.endedAt !== undefined);
    if (!normalClose && !correction) {
      throw new StoreError("STORE_WRITE_FAILED", "Session intervals change only through close or explicit correction.");
    }
  }

  for (const [id, oldEntry] of Object.entries(before.records.journeyEntries)) {
    const next = after.records.journeyEntries[id];
    if (!next) continue;
    const immutableFields = ["id", "userId", "occurredAt", "timeZoneAtOccurrence", "createdAt"] as const;
    if (!equalJson(
      fields(oldEntry as unknown as Record<string, unknown>, immutableFields),
      fields(next as unknown as Record<string, unknown>, immutableFields),
    )) throw new StoreError("STORE_WRITE_FAILED", "Journey occurrence and ownership are immutable.");
  }

  for (const [id, oldDecision] of Object.entries(before.records.decisionRecords)) {
    const next = after.records.decisionRecords[id];
    if (!next) continue;
    const immutableIdentity = ["id", "userId", "quarterId", "relatedTaskId", "createdAt"] as const;
    if (!equalJson(
      fields(oldDecision as unknown as Record<string, unknown>, immutableIdentity),
      fields(next as unknown as Record<string, unknown>, immutableIdentity),
    )) throw new StoreError("STORE_WRITE_FAILED", "Decision identity, ownership, and plan relationships are immutable.");

    if (oldDecision.supersedesDecisionId !== next.supersedesDecisionId) {
      const linkingReview = Object.values(after.records.decisionReviews).find(
        (review) => review.outcome === "SUPERSEDE" && review.decisionId === next.supersedesDecisionId && review.replacementDecisionId === id && !before.records.decisionReviews[review.id],
      );
      if (oldDecision.supersedesDecisionId || !next.supersedesDecisionId || !linkingReview) {
        throw new StoreError("STORE_WRITE_FAILED", "Decision supersession links change only with their append-only review.");
      }
    }

    if (oldDecision.status !== "DRAFT") {
      const originalReasoningFields = [
        "id", "userId", "quarterId", "relatedTaskId", "supersedesDecisionId", "title",
        "decisionDate", "context", "constraints", "options", "decision", "consequences",
        "assumptions", "falsifier", "initialReviewDate", "createdAt",
      ] as const;
      if (!equalJson(
        fields(oldDecision as unknown as Record<string, unknown>, originalReasoningFields),
        fields(next as unknown as Record<string, unknown>, originalReasoningFields),
      )) throw new StoreError("STORE_WRITE_FAILED", "Accepted Decision reasoning is immutable.");
      const acceptedToSuperseded = oldDecision.status === "ACCEPTED" && next.status === "SUPERSEDED" &&
        Object.values(after.records.decisionReviews).some(
          (review) => review.decisionId === id && review.outcome === "SUPERSEDE" && !before.records.decisionReviews[review.id],
        );
      if (oldDecision.status !== next.status && !acceptedToSuperseded) {
        throw new StoreError("STORE_WRITE_FAILED", "Decision status changes require an explicit domain command.");
      }
    } else if (next.status === "SUPERSEDED") {
      throw new StoreError("STORE_WRITE_FAILED", "A Draft Decision cannot be superseded.");
    }
  }

  for (const collectionName of ["taskLifecycleEvents", "dailyReviews", "decisionReviews", "aiReviews"] as const) {
    for (const [id, oldRecord] of Object.entries(before.records[collectionName])) {
      const next = after.records[collectionName][id];
      if (next && !equalJson(oldRecord, next)) {
        throw new StoreError("STORE_WRITE_FAILED", "Append-only history cannot be edited.");
      }
    }
  }

  for (const [id, receipt] of Object.entries(before.commandReceipts)) {
    if (!after.commandReceipts[id] || !equalJson(receipt, after.commandReceipts[id])) {
      throw new StoreError("STORE_WRITE_FAILED", "Command receipts are immutable.");
    }
  }
}
