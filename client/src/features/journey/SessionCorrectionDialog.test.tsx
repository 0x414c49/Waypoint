import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SessionDetail } from "./types.js";
import { SessionCorrectionDialog } from "./SessionCorrectionDialog.js";

const session: SessionDetail = {
  id: "session-1",
  etag: "etag-1",
  taskId: "task-1",
  startedAt: "2026-11-03T17:40:00.000Z",
  endedAt: "2026-11-03T18:12:00.000Z",
  timeZoneAtStart: "America/Los_Angeles",
  actualSecondsAtGeneratedAt: 1920,
  createdAt: "2026-11-03T17:40:00.000Z",
  updatedAt: "2026-11-03T18:12:00.000Z",
  correctedAt: null,
};

describe("session correction", () => {
  it("shows unambiguous UTC fields without silently using the browser timezone", async () => {
    const corrected = { ...session, correctedAt: "2026-11-04T09:00:00.000Z" };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(corrected)));
    vi.stubGlobal("fetch", fetchMock);
    const onCorrected = vi.fn();
    const user = userEvent.setup();
    render(<><div id="app-shell" /><SessionCorrectionDialog session={session} onClose={() => undefined} onCorrected={onCorrected} /></>);

    expect(screen.getByText(/captured in America\/Los_Angeles/)).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>("Started (UTC)").value).toBe("2026-11-03T17:40");
    expect(screen.getByLabelText<HTMLInputElement>("Ended (UTC)").value).toBe("2026-11-03T18:12");
    await user.click(screen.getByRole("button", { name: "Save correction" }));

    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      startedAt: "2026-11-03T17:40:00.000Z",
      endedAt: "2026-11-03T18:12:00.000Z",
    });
    expect(onCorrected).toHaveBeenCalledWith(corrected);
  });
});
