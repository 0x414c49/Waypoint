import { describe, expect, it, vi } from "vitest";
import type { JourneyEntry, SessionDetail, TaskDetail } from "./types.js";
import { carryForward, correctSession, createJourneyEntry, deleteJourneyEntry } from "./api.js";

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

describe("Journey API client", () => {
  it("reuses one key when a thought write has uncertain durability", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ code: "STORE_DURABILITY_UNCERTAIN" }, 503))
      .mockResolvedValueOnce(json({ id: "thought-1" }, 201));
    vi.stubGlobal("fetch", fetchMock);

    await createJourneyEntry({ text: "Retries need one owner." });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).get("Idempotency-Key");
    const second = new Headers((fetchMock.mock.calls[1]?.[1] as RequestInit).headers).get("Idempotency-Key");
    expect(first).toBeTruthy();
    expect(second).toBe(first);
  });

  it("reuses one key when carry forward retries after a transport failure", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("connection reset"))
      .mockResolvedValueOnce(json({ continuation: { id: "continuation-1" } }, 201));
    vi.stubGlobal("fetch", fetchMock);
    const detail = { task: { id: "task-1", etag: "etag-1" } } as TaskDetail;

    await carryForward(detail, "2026-11-04");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).get("Idempotency-Key");
    const second = new Headers((fetchMock.mock.calls[1]?.[1] as RequestInit).headers).get("Idempotency-Key");
    expect(second).toBe(first);
  });

  it("omits endedAt when correcting a running session", async () => {
    const running = { id: "session-1", etag: "etag-session", startedAt: "2026-11-03T17:00:00.000Z", endedAt: null } as SessionDetail;
    const fetchMock = vi.fn().mockResolvedValue(json(running));
    vi.stubGlobal("fetch", fetchMock);

    await correctSession(running, "2026-11-03T16:55:00.000Z", null);

    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({ startedAt: "2026-11-03T16:55:00.000Z" });
  });

  it("prevents active-task inference for a direct weekly reflection", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ id: "weekly-1" }, 201));
    vi.stubGlobal("fetch", fetchMock);

    await createJourneyEntry({ text: "Keep the retry boundary explicit.", relatedTaskId: null, relatedMilestoneId: "week-5" });

    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toMatchObject({
      relatedTaskId: null,
      relatedMilestoneId: "week-5",
    });
  });

  it("deletes exactly one thought with its current ETag", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const entry = { id: "thought-1", etag: '"journey-1"' } as JourneyEntry;

    await deleteJourneyEntry(entry);

    expect(fetchMock).toHaveBeenCalledWith("/api/journey/thought-1", {
      method: "DELETE",
      headers: { Accept: "application/json", "If-Match": '"journey-1"' },
    });
  });
});
