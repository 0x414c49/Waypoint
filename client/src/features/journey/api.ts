import { createIdempotencyKey } from "../today/api.js";
import type {
  ActivityResponse,
  ApiProblem,
  JourneyFilters,
  JourneyEntry,
  JourneyResponse,
  MilestoneSummary,
  SessionDetail,
  TaskDetail,
  TaskList,
} from "./types.js";

export class JourneyApiError extends Error {
  constructor(readonly problem: ApiProblem, readonly status: number) {
    super(problem.detail ?? "The request could not be completed.");
  }
}

async function read<T>(response: Response): Promise<T> {
  const value = await response.json() as T | ApiProblem;
  if (!response.ok) throw new JourneyApiError(value as ApiProblem, response.status);
  return value as T;
}

async function durabilityUncertain(response: Response): Promise<boolean> {
  if (response.status !== 503) return false;
  try {
    const value = await response.clone().json() as Partial<ApiProblem>;
    return value.code === "STORE_DURABILITY_UNCERTAIN";
  } catch {
    return false;
  }
}

async function retryUncertain(request: () => Promise<Response>): Promise<Response> {
  let response: Response;
  try {
    response = await request();
  } catch {
    response = await request();
  }
  if (await durabilityUncertain(response)) response = await request();
  return response;
}

export async function getJourney(filters: JourneyFilters, signal?: AbortSignal, cursor?: string): Promise<JourneyResponse> {
  const query = new URLSearchParams();
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  if (filters.taskId) query.set("taskId", filters.taskId);
  if (filters.milestoneId) query.set("milestoneId", filters.milestoneId);
  if (filters.type) query.set("type", filters.type);
  if (filters.changedMyMind) query.set("changedMyMind", "true");
  if (cursor) query.set("cursor", cursor);
  const suffix = query.size ? `?${query.toString()}` : "";
  const response = await fetch(`/api/journey${suffix}`, { headers: { Accept: "application/json" }, ...(signal ? { signal } : {}) });
  return read<JourneyResponse>(response);
}

export async function createJourneyEntry(input: {
  text: string;
  relatedTaskId?: string | null;
  relatedMilestoneId?: string;
  changedMyMind?: boolean;
}): Promise<void> {
  const idempotencyKey = createIdempotencyKey();
  const body = JSON.stringify({
    text: input.text,
    tags: [],
    changedMyMind: input.changedMyMind ?? false,
    ...(input.relatedTaskId !== undefined ? { relatedTaskId: input.relatedTaskId } : {}),
    ...(input.relatedMilestoneId ? { relatedMilestoneId: input.relatedMilestoneId } : {}),
  });
  const response = await retryUncertain(() => fetch("/api/journey", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body,
    }));
  await read<unknown>(response);
}

export async function updateJourneyEntry(
  entry: JourneyEntry,
  input: { text: string; changedMyMind: boolean },
): Promise<JourneyEntry> {
  const response = await fetch(`/api/journey/${encodeURIComponent(entry.id)}`, {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "If-Match": entry.etag,
    },
    body: JSON.stringify({
      text: input.text,
      tags: entry.tags,
      changedMyMind: input.changedMyMind,
      relatedTaskId: entry.relatedTask?.id ?? null,
      relatedMilestoneId: entry.relatedMilestone?.id ?? null,
      relatedDecisionId: entry.relatedDecision?.id ?? null,
    }),
  });
  return read<JourneyEntry>(response);
}

export async function getActivity(from: string, to: string, signal?: AbortSignal): Promise<ActivityResponse> {
  const query = new URLSearchParams({ from, to });
  const response = await fetch(`/api/activity?${query.toString()}`, { headers: { Accept: "application/json" }, ...(signal ? { signal } : {}) });
  return read<ActivityResponse>(response);
}

export async function getTaskDetail(taskId: string, signal?: AbortSignal): Promise<TaskDetail> {
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, { headers: { Accept: "application/json" }, ...(signal ? { signal } : {}) });
  return read<TaskDetail>(response);
}

export async function getAllTasks(signal?: AbortSignal): Promise<TaskList["items"]> {
  const items: TaskList["items"] = [];
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({ limit: "100" });
    if (cursor) query.set("cursor", cursor);
    const response = await fetch(`/api/tasks?${query.toString()}`, {
      headers: { Accept: "application/json" },
      ...(signal ? { signal } : {}),
    });
    const page = await read<TaskList>(response);
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return items;
}

export async function correctSession(
  session: SessionDetail,
  startedAt: string,
  endedAt: string | null,
): Promise<SessionDetail> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(session.id)}`, {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "If-Match": session.etag,
    },
    body: JSON.stringify({ startedAt, ...(endedAt ? { endedAt } : {}) }),
  });
  return read<SessionDetail>(response);
}

export async function carryForward(
  detail: TaskDetail,
  plannedDate: string,
  keyLearning?: string,
): Promise<{ continuation: { id: string } }> {
  const idempotencyKey = createIdempotencyKey();
  const body = JSON.stringify({ plannedDate, ...(keyLearning ? { keyLearning } : {}) });
  const response = await retryUncertain(() => fetch(`/api/tasks/${encodeURIComponent(detail.task.id)}/carry-forward`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "If-Match": detail.task.etag,
      "Idempotency-Key": idempotencyKey,
    },
    body,
  }));
  return read<{ continuation: { id: string } }>(response);
}

export async function getMilestoneSummary(quarterId: string, milestoneId: string, signal?: AbortSignal): Promise<MilestoneSummary> {
  const response = await fetch(`/api/quarters/${encodeURIComponent(quarterId)}/milestones/${encodeURIComponent(milestoneId)}/summary`, {
    headers: { Accept: "application/json" },
    ...(signal ? { signal } : {}),
  });
  return read<MilestoneSummary>(response);
}
