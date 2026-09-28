import type {
  ActivityContract,
  JourneyTimelineContract,
  MilestoneSummaryContract,
  ProblemDetails,
  SessionProjectionContract,
  TaskDetailContract,
  TaskListContract,
} from "../../../../shared/contracts/index.js";

export interface ThoughtContext {
  taskId: string;
  taskTitle: string;
}

export type JourneyItem = JourneyTimelineContract["items"][number];
export type JourneyItemType = JourneyItem["type"];
export type JourneyEntry = Extract<JourneyItem, { type: "THOUGHT" | "WEEKLY_REFLECTION" }>;
export type JourneyResponse = JourneyTimelineContract;

export interface JourneyFilters {
  from?: string;
  to?: string;
  taskId?: string;
  milestoneId?: string;
  type?: JourneyItemType | "";
  changedMyMind?: boolean;
}

export type ActivityResponse = ActivityContract;
export type SessionDetail = SessionProjectionContract;
export type TaskDetail = TaskDetailContract;
export type TaskList = TaskListContract;
export type MilestoneSummary = MilestoneSummaryContract;
export type ApiProblem = ProblemDetails;
