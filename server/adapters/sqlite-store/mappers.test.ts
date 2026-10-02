// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createProductionSeed } from "../../domain/production-seed.js";
import { StoreError } from "../store-errors.js";
import {
  accountToRow,
  aiReviewToRow,
  authInviteToRow,
  authSessionToRow,
  dailyReviewToRow,
  decisionReviewToRow,
  decisionToRow,
  emailPreferenceToRow,
  focusAreaToRow,
  journeyEntryToRow,
  lifecycleEventToRow,
  mediaRecordToRow,
  milestoneToRow,
  quarterToRow,
  receiptMapKey,
  receiptToRow,
  rowToAccount,
  rowToAiReview,
  rowToAuthInvite,
  rowToAuthSession,
  rowToDailyReview,
  rowToDecision,
  rowToDecisionReview,
  rowToEmailPreference,
  rowToFocusArea,
  rowToJourneyEntry,
  rowToLifecycleEvent,
  rowToMediaRecord,
  rowToMilestone,
  rowToQuarter,
  rowToReceipt,
  rowToSession,
  rowToTask,
  rowToUser,
  sessionOwnerUserId,
  sessionToRow,
  taskToRow,
  userToRow,
  type RowParams,
} from "./mappers.js";

const instant = "2026-09-27T10:00:00.000Z";

function nullsFor(params: RowParams): RowParams {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, value === undefined ? null : value]),
  );
}

function omit<T extends Record<string, unknown>, K extends keyof T>(
  value: T,
  ...keys: readonly K[]
): Omit<T, K> {
  const copy: Record<string, unknown> = { ...value };
  for (const key of keys) delete copy[key as string];
  return copy as Omit<T, K>;
}

describe("sqlite mappers", () => {
  it("round-trips users", () => {
    const record = { id: "local-user", name: "Ali", timeZone: "Europe/Amsterdam", createdAt: instant };
    expect(rowToUser(userToRow(record))).toEqual(record);
  });

  it("round-trips accounts with and without optional cipher fields", () => {
    const full = {
      id: "account-1",
      userId: "local-user",
      email: "ali@example.com",
      role: "OWNER" as const,
      passwordVerifier: {
        algorithm: "scrypt" as const,
        version: 1,
        N: 16384,
        r: 8,
        p: 1,
        maxmem: 33554432,
        salt: "a".repeat(24),
        derivedKey: "b".repeat(86),
      },
      totpSecretCipher: {
        algorithm: "aes-256-gcm" as const,
        version: 1 as const,
        iv: "c".repeat(16),
        authTag: "d".repeat(24),
        ciphertext: "e".repeat(44),
      },
      lastTotpStep: 7,
      createdAt: instant,
      updatedAt: instant,
      disabledAt: instant,
    };
    expect(rowToAccount(accountToRow(full))).toEqual(full);
    const minimal = omit(full, "totpSecretCipher", "lastTotpStep", "disabledAt");
    const row = accountToRow(minimal);
    expect(row.totp_secret_cipher).toBeNull();
    expect(row.last_totp_step).toBeNull();
    expect(row.disabled_at).toBeNull();
    expect(rowToAccount(row)).toEqual(minimal);
  });

  it("round-trips auth invites with every lifecycle timestamp", () => {
    const record = {
      id: "a".repeat(64),
      intendedEmail: "friend@example.com",
      role: "MEMBER" as const,
      createdByUserId: "local-user",
      bootstrap: true,
      legacyUserId: "legacy-1",
      createdAt: instant,
      expiresAt: instant,
      consumedAt: instant,
      consumedByUserId: "local-user",
      revokedAt: instant,
    };
    expect(rowToAuthInvite(authInviteToRow(record))).toEqual(record);
    expect(rowToAuthInvite(authInviteToRow({ ...record, bootstrap: false }))).toMatchObject({ bootstrap: false });
    const minimal = omit(record, "createdByUserId", "legacyUserId", "consumedAt", "consumedByUserId", "revokedAt");
    expect(rowToAuthInvite(authInviteToRow(minimal))).toEqual(minimal);
  });

  it("round-trips auth sessions with and without revocation", () => {
    const record = {
      id: "b".repeat(64),
      accountId: "account-1",
      userId: "local-user",
      createdAt: instant,
      lastSeenAt: instant,
      expiresAt: instant,
      revokedAt: instant,
    };
    expect(rowToAuthSession(authSessionToRow(record))).toEqual(record);
    const minimal = omit(record, "revokedAt");
    expect(rowToAuthSession(authSessionToRow(minimal))).toEqual(minimal);
  });

  it("round-trips media records", () => {
    const record = {
      id: "media-1",
      filename: "shot.png",
      userId: "local-user",
      mediaType: "image/png" as const,
      byteLength: 12,
      createdAt: instant,
    };
    expect(rowToMediaRecord(mediaRecordToRow(record))).toEqual(record);
  });

  it("round-trips email preferences with and without unsubscribe", () => {
    const record = { id: "local-user", userId: "local-user", digestUnsubscribedAt: instant, updatedAt: instant };
    expect(rowToEmailPreference(emailPreferenceToRow(record))).toEqual(record);
    const minimal = omit(record, "digestUnsubscribedAt");
    const row = emailPreferenceToRow(minimal);
    expect(row.digest_unsubscribed_at).toBeNull();
    expect(rowToEmailPreference(row)).toEqual(minimal);
  });

  it("round-trips quarters including intent snapshots and success criteria blobs", () => {
    const seed = createProductionSeed(instant);
    const quarter = Object.values(seed.records.quarters)[0]!;
    expect(rowToQuarter(quarterToRow(quarter))).toEqual(quarter);

    const withSnapshot = {
      ...quarter,
      description: "desc",
      mantra: "mantra",
      lastPlanImportedAt: instant,
      intentSnapshot: {
        capturedAt: instant,
        planRevision: 1,
        timeZoneAtCapture: "Europe/Amsterdam",
        title: quarter.title,
        description: "old",
        mantra: "old mantra",
        startDate: quarter.startDate,
        endDate: quarter.endDate,
        successCriteria: quarter.successCriteria,
        focusAreas: [{ id: "fa-1", name: "Area", targetMinutes: 30 }],
      },
    };
    expect(rowToQuarter(quarterToRow(withSnapshot))).toEqual(withSnapshot);
  });

  it("round-trips focus areas, milestones, and tasks from the production seed", () => {
    const seed = createProductionSeed(instant);
    for (const area of Object.values(seed.records.focusAreas)) {
      expect(rowToFocusArea(focusAreaToRow(area))).toEqual(area);
    }
    for (const milestone of Object.values(seed.records.milestones)) {
      expect(rowToMilestone(milestoneToRow(milestone))).toEqual(milestone);
    }
    for (const task of Object.values(seed.records.tasks)) {
      expect(rowToTask(taskToRow(task))).toEqual(task);
    }
  });

  it("round-trips tasks with snapshots, prompts, and continuations", () => {
    const seed = createProductionSeed(instant);
    const task = Object.values(seed.records.tasks)[0]!;
    const full = {
      ...task,
      decisionPrompt: { decisionId: "decision-1", suggestedTitle: "Decide", initialReviewDate: "2026-10-01" },
      removedFromPlanAt: instant,
      planSnapshot: {
        capturedAt: instant,
        planRevision: 1,
        ...(task.focusAreaId === undefined ? {} : { focusAreaId: task.focusAreaId }),
        focusAreaName: "Area",
        ...(task.milestoneId === undefined ? {} : { milestoneId: task.milestoneId }),
        milestoneTitle: "Week",
        plannedDate: task.plannedDate,
        title: task.title,
        ...(task.description === undefined ? {} : { description: task.description }),
        ...(task.plannedMinutes === undefined ? {} : { plannedMinutes: task.plannedMinutes }),
        tags: task.tags,
        recommendationMode: task.recommendationMode,
      },
      continuationOfTaskId: "source-task",
    };
    expect(rowToTask(taskToRow(full))).toEqual(full);
  });

  it("round-trips sessions and keeps the denormalized owner out of the domain record", () => {
    const open = {
      id: "session-1",
      taskId: "task-1",
      startedAt: instant,
      timeZoneAtStart: "Europe/Amsterdam",
      createdAt: instant,
      updatedAt: instant,
    };
    const openRow = sessionToRow(open, "local-user");
    expect(openRow.owner_user_id).toBe("local-user");
    expect(openRow.ended_at).toBeNull();
    expect(rowToSession(openRow)).toEqual(open);
    expect(sessionOwnerUserId(openRow)).toBe("local-user");

    const closed = {
      ...open,
      id: "session-2",
      endedAt: "2026-09-27T10:25:00.000Z",
      intentionMinutes: 10 as const,
      correctedAt: "2026-09-27T10:30:00.000Z",
    };
    expect(rowToSession(sessionToRow(closed, "local-user"))).toEqual(closed);
  });

  it("round-trips lifecycle events, reviews, and journey entries", () => {
    const event = {
      id: "event-1",
      taskId: "task-1",
      sequence: 2,
      type: "CARRIED_FORWARD" as const,
      occurredAt: instant,
      timeZoneAtOccurrence: "Europe/Amsterdam",
      relatedTaskId: "task-2",
      undoesEventId: "event-0",
      createdAt: instant,
    };
    expect(rowToLifecycleEvent(lifecycleEventToRow(event))).toEqual(event);

    const review = {
      id: "review-1",
      taskId: "task-1",
      finishEventId: "event-1",
      outcome: "PARTIAL" as const,
      keyLearning: "learned",
      reflection: "deeper",
      createdAt: instant,
      updatedAt: instant,
    };
    expect(rowToDailyReview(dailyReviewToRow(review))).toEqual(review);
    const bareReview = omit(review, "keyLearning", "reflection");
    expect(rowToDailyReview(dailyReviewToRow(bareReview))).toEqual(bareReview);

    const entry = {
      id: "entry-1",
      userId: "local-user",
      occurredAt: instant,
      timeZoneAtOccurrence: "Europe/Amsterdam",
      text: "A thought with caf\u00e9",
      tags: ["tag-1"],
      relatedTaskId: "task-1",
      relatedMilestoneId: "milestone-1",
      relatedDecisionId: "decision-1",
      changedMyMind: true,
      feeling: "curious" as const,
      createdAt: instant,
      updatedAt: instant,
    };
    expect(rowToJourneyEntry(journeyEntryToRow(entry))).toEqual(entry);
  });

  it("round-trips decisions with constraint/option/assumption blobs", () => {
    const record = {
      id: "decision-1",
      userId: "local-user",
      quarterId: "q1",
      relatedTaskId: "task-1",
      supersedesDecisionId: "decision-0",
      title: "Decide",
      decisionDate: "2026-09-27",
      status: "ACCEPTED" as const,
      context: "ctx",
      constraints: ["c1"],
      options: [{ id: "opt-1", title: "A", description: "desc", strengths: ["s"], weaknesses: ["w"] }],
      decision: "A",
      consequences: "none",
      assumptions: ["a1"],
      falsifier: "f",
      initialReviewDate: "2026-10-01",
      createdAt: instant,
      updatedAt: instant,
    };
    expect(rowToDecision(decisionToRow(record))).toEqual(record);

    const review = {
      id: "dr-1",
      decisionId: "decision-1",
      sequence: 1,
      reviewedAt: instant,
      timeZoneAtReview: "Europe/Amsterdam",
      outcome: "DEFERRED" as const,
      notes: "later",
      nextReviewDate: "2026-10-05",
      replacementDecisionId: "decision-2",
      createdAt: instant,
    };
    expect(rowToDecisionReview(decisionReviewToRow(review))).toEqual(review);
  });

  it("round-trips legacy AI reviews and command receipts with opaque blobs", () => {
    const review = {
      id: "ai-1",
      userId: "local-user",
      targetType: "TASK" as const,
      targetId: "task-1",
      provider: "local",
      model: "m",
      summary: "s",
      strengths: ["s1"],
      gaps: ["g1"],
      suggestedFollowUp: "f",
      questions: ["q?"],
      generatedAt: instant,
      timeZoneAtGeneration: "Europe/Amsterdam",
    };
    expect(rowToAiReview(aiReviewToRow(review))).toEqual(review);

    const receipt = {
      userId: "local-user",
      key: "cmd-1",
      method: "POST",
      route: "/api/test",
      requestFingerprint: "fp",
      result: {
        outcomeKind: "TEST",
        createdRecordIds: ["a"],
        affectedRecordIds: ["b"],
        outcomeFacts: { nested: { n: 1 }, flag: true },
      },
      committedStoreRevision: 3,
      createdAt: instant,
    };
    expect(rowToReceipt(receiptToRow(receipt))).toEqual(receipt);
    expect(receiptMapKey("local-user", "cmd-1")).toBe("local-user:cmd-1");
  });

  it("preserves instant strings verbatim and rejects misshapen rows", () => {
    const record = { id: "u", name: "N", timeZone: "UTC", createdAt: instant };
    const row = nullsFor(userToRow(record));
    expect(rowToUser(row)).toEqual(record);
    expect(() => rowToUser({ ...row, name: 42 })).toThrow(StoreError);
    expect(() => rowToTask({ id: "t" })).toThrow(StoreError);
    expect(() => rowToReceipt({ user_id: "u", key: "k" })).toThrow(StoreError);
  });
});
