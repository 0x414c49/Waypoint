import { describe, expect, it, vi } from "vitest";
import { actOnTask } from "./api.js";

describe("Today API client", () => {
  it("reuses the logical action key for an uncertain transport retry", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("connection reset"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);

    await actOnTask("task/one", "pause", "etag-1", "logical-action-key-1234");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) {
      const options = call[1] as RequestInit;
      expect(new Headers(options.headers).get("Idempotency-Key")).toBe("logical-action-key-1234");
      expect(new Headers(options.headers).get("If-Match")).toBe("etag-1");
    }
  });

  it("reuses the logical action key when durability is uncertain", async () => {
    const uncertain = new Response(JSON.stringify({
      type: "urn:test",
      title: "Store durability is uncertain",
      status: 503,
      code: "STORE_DURABILITY_UNCERTAIN",
      detail: "Retry the exact request.",
      traceId: "trace-1",
    }), { status: 503 });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(uncertain)
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);

    await actOnTask("task-one", "finish", "etag-2", "durability-retry-key-123", {
      outcome: "ACHIEVED",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers);
    const second = new Headers((fetchMock.mock.calls[1]?.[1] as RequestInit).headers);
    expect(first.get("Idempotency-Key")).toBe("durability-retry-key-123");
    expect(second.get("Idempotency-Key")).toBe(first.get("Idempotency-Key"));
  });
});
