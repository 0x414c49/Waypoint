import type { AIReviewContract, AIReviewListContract, AIReviewTargetType } from "../../../../shared/contracts/index.js";
import type { ProblemDetails } from "../../../../shared/contracts/problem.js";
import { createIdempotencyKey } from "../today/api.js";

export class AIReviewApiError extends Error {
  constructor(readonly problem: ProblemDetails, readonly status: number) {
    super(problem.detail ?? "Generated advice could not be loaded.");
  }
}

async function read<T>(response: Response): Promise<T> {
  let body: unknown;
  try { body = await response.json(); } catch { body = {}; }
  if (!response.ok) throw new AIReviewApiError(body as ProblemDetails, response.status);
  return body as T;
}

async function durabilityUncertain(response: Response): Promise<boolean> {
  if (response.status !== 503) return false;
  try { return (await response.clone().json() as { code?: string }).code === "STORE_DURABILITY_UNCERTAIN"; }
  catch { return false; }
}

export async function getAIReviews(targetType: AIReviewTargetType, targetId: string, signal?: AbortSignal): Promise<AIReviewListContract> {
  const query = new URLSearchParams({ targetType, targetId });
  return read<AIReviewListContract>(await fetch(`/api/ai/reviews?${query}`, {
    headers: { Accept: "application/json" },
    ...(signal ? { signal } : {}),
  }));
}

export async function createAIReview(targetType: AIReviewTargetType, targetId: string): Promise<AIReviewContract> {
  const idempotencyKey = createIdempotencyKey();
  const path = targetType === "TASK" ? `/api/ai/review/task/${encodeURIComponent(targetId)}`
    : targetType === "WEEK" ? "/api/ai/review/week"
      : targetType === "QUARTER" ? `/api/ai/review/quarter/${encodeURIComponent(targetId)}`
        : `/api/ai/review/decision/${encodeURIComponent(targetId)}`;
  const body = targetType === "WEEK" ? JSON.stringify({ milestoneId: targetId }) : "{}";
  const request = () => fetch(path, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body,
  });
  let response: Response;
  try { response = await request(); }
  catch { response = await request(); }
  if (await durabilityUncertain(response)) response = await request();
  return read<AIReviewContract>(response);
}
