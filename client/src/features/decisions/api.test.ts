import { beforeEach, describe, expect, it, vi } from "vitest";
import { acceptDecision, addDecisionReview, createTaskDecision, saveDecision } from "./api.js";

const detail = {
  id: "decision-1",
  etag: "etag-2",
  title: "Retry ownership",
  status: "DRAFT",
  constraints: [],
  options: [],
  assumptions: [],
  reviews: [],
  createdAt: "2026-09-29T08:00:00.000Z",
  updatedAt: "2026-09-29T08:00:00.000Z",
};

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

describe("decision API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("creates a contextual Draft without changing the Task request shape", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json(detail));
    vi.stubGlobal("fetch", fetchMock);

    await createTaskDecision("task-1", "task-etag");

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/tasks/task-1/decision-draft");
    expect(new Headers(options.headers).get("If-Match")).toBe("task-etag");
    expect(new Headers(options.headers).get("Idempotency-Key")).toBeTruthy();
    expect(options.body).toBe("{}");
  });

  it("saves Draft reasoning with an ETag and Accepts through a separate command", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json(detail));
    vi.stubGlobal("fetch", fetchMock);

    await saveDecision("decision-1", "draft-etag", { title: "Retry ownership", constraints: [], options: [], assumptions: [] });
    await acceptDecision("decision-1", "saved-etag");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/decisions/decision-1");
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("If-Match")).toBe("draft-etag");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/decisions/decision-1/accept");
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("If-Match")).toBe("saved-etag");
  });

  it("appends reviews with concurrency and idempotency headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(detail));
    vi.stubGlobal("fetch", fetchMock);

    await addDecisionReview("decision-1", "review-etag", { outcome: "DEFERRED", nextReviewDate: "2026-12-01" });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(options.headers).get("If-Match")).toBe("review-etag");
    expect(new Headers(options.headers).get("Idempotency-Key")).toBeTruthy();
    expect(JSON.parse(options.body as string)).toEqual({ outcome: "DEFERRED", nextReviewDate: "2026-12-01" });
  });

  it("preserves a compact stale-write message returned by the HTTP framework", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({
      statusCode: 412,
      code: "STALE_WRITE",
      error: "Precondition Failed",
      message: "Refresh it before saving.",
    }, 412)));

    await expect(saveDecision("decision-1", "old-etag", {
      title: "Retry ownership",
      constraints: [],
      options: [],
      assumptions: [],
    })).rejects.toMatchObject({
      status: 412,
      message: "Refresh it before saving.",
      problem: { code: "STALE_WRITE", detail: "Refresh it before saving." },
    });
  });
});
