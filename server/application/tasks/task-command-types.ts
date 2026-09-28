import type { Dashboard, TaskProjection } from "../dashboard/dashboard.js";

export type TaskAction = "start" | "pause" | "resume" | "finish" | "reopen";

export interface ActiveSessionResolution {
  kind: "PAUSE_AND_SWITCH";
  activeSessionId: string;
  activeTaskEtag: string;
}

export interface TaskCommandBody {
  intentionMinutes?: 10;
  activeSessionResolution?: ActiveSessionResolution;
  outcome?: "ACHIEVED" | "PARTIAL" | "NOT_ACHIEVED";
  keyLearning?: string;
  reflection?: string;
  closureEventId?: string;
}

export interface TaskCommandRequest {
  action: TaskAction;
  taskId: string;
  body: TaskCommandBody;
  ifMatch: string;
  idempotencyKey: string;
  method: "POST";
  route: string;
}

export interface TaskActionResponse {
  task: TaskProjection;
  activeSession: Dashboard["activeSession"];
  affectedTasks: TaskProjection[];
  dashboard: Dashboard;
  completion?: {
    taskId: string;
    finishEventId: string;
    reviewId: string;
    outcome: "ACHIEVED" | "PARTIAL" | "NOT_ACHIEVED";
    undoUntil: string;
  };
  reopened?: { taskId: string; reopenedEventId: string; closureEventId: string };
}

export interface CommandOutcome {
  taskId: string;
  affectedTaskIds: string[];
  sessionId?: string;
  finishEventId?: string;
  reviewId?: string;
  outcome?: "ACHIEVED" | "PARTIAL" | "NOT_ACHIEVED";
  undoUntil?: string;
  closureEventId?: string;
  reopenedEventId?: string;
}
