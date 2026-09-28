import type {
  DashboardContract,
  ProblemDetails as SharedProblemDetails,
  TaskActionResponseContract,
  TaskProjectionContract,
} from "../../../../shared/contracts/index.js";

export type Dashboard = DashboardContract;
export type TaskProjection = TaskProjectionContract;
export type TaskActionResponse = TaskActionResponseContract;

export type TaskAction = "start" | "pause" | "resume" | "finish" | "reopen";
export type FinishOutcome = NonNullable<TaskActionResponse["completion"]>["outcome"];

export interface ActiveSessionResolution {
  kind: "PAUSE_AND_SWITCH";
  activeSessionId: string;
  activeTaskEtag: string;
}

export interface ActionBody {
  intentionMinutes?: 10;
  activeSessionResolution?: ActiveSessionResolution;
  outcome?: FinishOutcome;
  keyLearning?: string;
  closureEventId?: string;
}

export type ConflictSession = {
  id: string;
  startedAt: string;
  task: { id: string; title: string; etag: string };
};

export type ProblemDetails = SharedProblemDetails & {
  current?: { activeSession?: ConflictSession };
};
