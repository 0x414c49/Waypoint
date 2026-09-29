import { createIdempotencyKey } from "../today/api.js";
import type {
  DecisionDetail,
  DecisionDraftInput,
  DecisionList,
  DecisionProblem,
  DecisionReviewOutcome,
} from "./types.js";

export class DecisionApiError extends Error {
  constructor(readonly problem: DecisionProblem, readonly status: number) {
    super(problem.detail ?? "The request could not be completed.");
  }
}

async function read<T>(response: Response): Promise<T> {
  const value = await response.json() as T | DecisionProblem | {
    statusCode?: number;
    code?: string;
    error?: string;
    message?: string;
  };
  if (!response.ok) {
    const wire = value as Partial<DecisionProblem> & { error?: string; message?: string };
    const problem = {
      type: wire.type ?? `urn:journey-tracker:problem:${(wire.code ?? "request-failed").toLowerCase().replaceAll("_", "-")}`,
      title: wire.title ?? wire.error ?? "The request could not be completed",
      status: wire.status ?? response.status,
      code: wire.code ?? "REQUEST_FAILED",
      detail: wire.detail ?? wire.message ?? "The request could not be completed.",
      traceId: wire.traceId ?? "unavailable",
      ...(wire.instance ? { instance: wire.instance } : {}),
    } satisfies DecisionProblem;
    throw new DecisionApiError(problem, response.status);
  }
  return value as T;
}

async function retryUncertain(request: () => Promise<Response>): Promise<Response> {
  let response: Response;
  try {
    response = await request();
  } catch {
    response = await request();
  }
  if (response.status === 503) {
    const problem = await response.clone().json().catch(() => null) as Partial<DecisionProblem> | null;
    if (problem?.code === "STORE_DURABILITY_UNCERTAIN") response = await request();
  }
  return response;
}

export async function getDecisions(
  filters: { status?: string; review?: "due"; cursor?: string; limit?: number } = {},
  signal?: AbortSignal,
): Promise<DecisionList> {
  const query = new URLSearchParams();
  if (filters.status) query.set("status", filters.status);
  if (filters.review) query.set("review", filters.review);
  if (filters.cursor) query.set("cursor", filters.cursor);
  if (filters.limit) query.set("limit", String(filters.limit));
  const response = await fetch(`/api/decisions${query.size ? `?${query.toString()}` : ""}`, {
    headers: { Accept: "application/json" },
    ...(signal ? { signal } : {}),
  });
  return read<DecisionList>(response);
}

export async function getDecision(id: string, signal?: AbortSignal): Promise<DecisionDetail> {
  const response = await fetch(`/api/decisions/${encodeURIComponent(id)}`, {
    headers: { Accept: "application/json" },
    ...(signal ? { signal } : {}),
  });
  return read<DecisionDetail>(response);
}

export async function createDecision(input: {
  title: string;
  quarterId?: string;
  relatedTaskId?: string;
  initialReviewDate?: string;
}): Promise<DecisionDetail> {
  const key = createIdempotencyKey();
  const response = await retryUncertain(() => fetch("/api/decisions", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    body: JSON.stringify(input),
  }));
  return read<DecisionDetail>(response);
}

export async function createTaskDecision(taskId: string, taskEtag: string): Promise<DecisionDetail> {
  const key = createIdempotencyKey();
  const response = await retryUncertain(() => fetch(`/api/tasks/${encodeURIComponent(taskId)}/decision-draft`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "If-Match": taskEtag,
      "Idempotency-Key": key,
    },
    body: "{}",
  }));
  return read<DecisionDetail>(response);
}

export async function saveDecision(id: string, etag: string, input: DecisionDraftInput): Promise<DecisionDetail> {
  const response = await fetch(`/api/decisions/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "If-Match": etag,
    },
    body: JSON.stringify(input),
  });
  return read<DecisionDetail>(response);
}

export async function acceptDecision(id: string, etag: string): Promise<DecisionDetail> {
  const key = createIdempotencyKey();
  const response = await retryUncertain(() => fetch(`/api/decisions/${encodeURIComponent(id)}/accept`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "If-Match": etag,
      "Idempotency-Key": key,
    },
    body: "{}",
  }));
  return read<DecisionDetail>(response);
}

export async function addDecisionReview(
  id: string,
  etag: string,
  input: {
    outcome: DecisionReviewOutcome;
    notes?: string;
    nextReviewDate?: string;
    replacementDecisionId?: string;
  },
): Promise<DecisionDetail> {
  const key = createIdempotencyKey();
  const response = await retryUncertain(() => fetch(`/api/decisions/${encodeURIComponent(id)}/review`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "If-Match": etag,
      "Idempotency-Key": key,
    },
    body: JSON.stringify(input),
  }));
  return read<DecisionDetail>(response);
}
