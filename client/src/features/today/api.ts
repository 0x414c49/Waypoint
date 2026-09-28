import type {
  ActionBody,
  Dashboard,
  ProblemDetails,
  TaskAction,
  TaskActionResponse,
} from "./types.js";

export class ApiError extends Error {
  constructor(readonly problem: ProblemDetails) {
    super(problem.detail);
    this.name = "ApiError";
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const value = (await response.json()) as T | ProblemDetails;
  if (!response.ok) throw new ApiError(value as ProblemDetails);
  return value as T;
}

async function isDurabilityUncertain(response: Response): Promise<boolean> {
  if (response.status !== 503) return false;
  try {
    const problem = (await response.clone().json()) as Partial<ProblemDetails>;
    return problem.code === "STORE_DURABILITY_UNCERTAIN";
  } catch {
    return false;
  }
}

export async function getDashboard(signal?: AbortSignal): Promise<Dashboard> {
  const response = await fetch("/api/dashboard", {
    headers: { Accept: "application/json" },
    ...(signal ? { signal } : {}),
  });
  return readJson<Dashboard>(response);
}

export function createIdempotencyKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const random = Math.random().toString(36).slice(2);
  return `journey-${Date.now().toString(36)}-${random.padEnd(16, "0")}`;
}

export async function actOnTask(
  taskId: string,
  action: TaskAction,
  etag: string,
  idempotencyKey: string,
  body: ActionBody = {},
): Promise<TaskActionResponse> {
  const request = () =>
    fetch(`/api/tasks/${encodeURIComponent(taskId)}/${action}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "If-Match": etag,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(body),
    });
  let response: Response;
  try {
    response = await request();
  } catch {
    // One uncertain transport failure is safe to retry with the same logical action key.
    response = await request();
  }
  if (await isDurabilityUncertain(response)) {
    response = await request();
  }
  return readJson<TaskActionResponse>(response);
}
