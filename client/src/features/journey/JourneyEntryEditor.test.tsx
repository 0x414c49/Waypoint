import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JourneyEntry } from "./types.js";
import { JourneyEntryEditor } from "./JourneyEntryEditor.js";

const entry: JourneyEntry = {
  id: "thought-1", etag: '"journey-1"', type: "WEEKLY_REFLECTION",
  occurredAt: "2026-11-03T17:00:00.000Z", localDate: "2026-11-03",
  text: "First view", tags: ["reliability"], changedMyMind: false,
  relatedTask: null,
  relatedMilestone: { id: "week-5", quarterId: "quarter-1", title: "Week 5" },
  relatedDecision: null,
  createdAt: "2026-11-03T17:00:00.000Z", updatedAt: null,
};

afterEach(() => vi.unstubAllGlobals());

describe("Journey entry editor", () => {
  it("edits a weekly thought and can mark changed thinking without losing context", async () => {
    const updated = { ...entry, text: "Revised view", changedMyMind: true, etag: '"journey-2"' };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(updated)));
    vi.stubGlobal("fetch", fetchMock);
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<><div id="app-shell" /><JourneyEntryEditor entry={entry} onClose={() => undefined} onSaved={onSaved} /></>);

    const textbox = screen.getByRole("textbox", { name: "What is worth keeping?" });
    await user.clear(textbox);
    await user.type(textbox, "Revised view");
    await user.click(screen.getByRole("checkbox", { name: "This changed how I think" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(request.headers).toMatchObject({ "If-Match": entry.etag });
    expect(JSON.parse(request.body as string)).toEqual({
      text: "Revised view", tags: ["reliability"], changedMyMind: true,
      relatedTaskId: null, relatedMilestoneId: "week-5", relatedDecisionId: null,
    });
    expect(onSaved).toHaveBeenCalledWith(updated);
  });
});
