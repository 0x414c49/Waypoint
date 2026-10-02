import type { MilestoneRecord, TaskRecord } from "../../domain/journey-state.js";

export type DashboardState = "ONBOARDING" | "READY" | "RUNNING" | "PAUSED" | "FINISHED" | "LIGHT";

export interface PlanProjection {
  focusArea?: { id: string; name: string };
  milestone?: { id: string; title: string };
  plannedDate: string;
  title: string;
  description?: string;
  plannedMinutes?: number;
  tags: string[];
  recommendationMode: TaskRecord["recommendationMode"];
  removedFromPlanAt?: string;
}

export interface TaskProjection {
  id: string;
  etag: string;
  status: TaskRecord["status"];
  currentPlan: PlanProjection;
  historicalPlan?: PlanProjection & { capturedAt: string; planRevision: number };
  displayPlanSource: "CURRENT" | "HISTORICAL";
  displayPlan: PlanProjection;
  timing: { actualSecondsAtGeneratedAt: number; firstStartedAt: string | null; runningSince: string | null };
  availableActions: string[];
  decisionContext?: {
    decisionId: string;
    suggestedTitle: string;
    initialReviewDate: string | null;
    action: "CREATE_DRAFT" | "OPEN_DECISION";
    decision: { id: string; title: string; status: "DRAFT" | "ACCEPTED" | "SUPERSEDED" } | null;
  };
}

export interface Dashboard {
  dataRevision: number;
  generatedAt: string;
  today: string;
  timeZone: string;
  quarter: { id: string; title: string; planRevision: number } | null;
  state: DashboardState;
  hero: { state: DashboardState; reason: string; task: TaskProjection | null; timing: TaskProjection["timing"] | null; primaryAction: { kind: string } | null; secondaryActions: Array<{ kind: string }> };
  activeSession: null | { id: string; etag: string; task: { id: string; title: string; etag: string }; startedAt: string; timeZoneAtStart: string; intentionMinutes?: 10; sessionElapsedSecondsAtGeneratedAt: number; taskActualSecondsAtGeneratedAt: number };
  upNext: null | { reason: string; task: TaskProjection; remainingTodayCount: number };
  optionalToday: null | { label: "Only if useful"; task: TaskProjection };
  leftovers: { totalCount: number; items: TaskProjection[] };
  activityPreview: { startDate: string; endDate: string; days: Array<{ date: string; sessionSeconds: number; level: number }> };
  milestoneSummary: null | { id: string; title: string; startDate: string; endDate: string; mode: MilestoneRecord["mode"]; sessionSeconds: number; sessionCount: number; plannedItemCount: number; touchedItemCount: number; finishedItemCount: number; skippedItemCount: number; openItemCount: number; thoughtCount: number; changedMyMindCount: number; href: string };
  decisionReviewsDue: { count: number; items: Array<{ decisionId: string; title: string; dueDate: string }> };
}
