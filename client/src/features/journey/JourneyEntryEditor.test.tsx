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
    render(<><div id="app-shell" /><JourneyEntryEditor entry={entry} onClose={() => undefined} onSaved={onSaved} onDeleted={() => undefined} /></>);

    const textbox = screen.getByRole("textbox", { name: "What is worth keeping?" });
    await user.clear(textbox);
    await user.type(textbox, "Revised view");
    await user.click(screen.getByRole("checkbox", { name: "This changed how I think" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(request.headers).toMatchObject({ "If-Match": entry.etag });
    expect(JSON.parse(request.body as string)).toEqual({
      text: "Revised view", tags: ["reliability"], changedMyMind: true,
      feeling: null,
      relatedTaskId: null, relatedMilestoneId: "week-5", relatedDecisionId: null,
    });
    expect(onSaved).toHaveBeenCalledWith(updated);
  });

  it("requires confirmation before deleting and identifies unsaved edits", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const onDeleted = vi.fn();
    const user = userEvent.setup();
    render(<><div id="app-shell" /><JourneyEntryEditor entry={entry} onClose={() => undefined} onSaved={() => undefined} onDeleted={onDeleted} /></>);

    await user.type(screen.getByRole("textbox", { name: "What is worth keeping?" }), " New detail.");
    await user.click(screen.getByRole("button", { name: "Delete thought" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Your unsaved edits in this window will also be lost.")).toBeTruthy();
    const keepThought = screen.getByRole("button", { name: "Keep thought" });
    expect(document.activeElement).toBe(keepThought);

    await user.click(keepThought);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Delete thought" }));
    await user.click(screen.getByRole("button", { name: "Delete thought" }));
    await user.click(screen.getByRole("button", { name: "Delete thought" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/journey/thought-1", {
      method: "DELETE",
      headers: { Accept: "application/json", "If-Match": entry.etag },
    });
    expect(onDeleted).toHaveBeenCalledWith(entry.id);
  });

  it("keeps the confirmation open when deletion fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "Refresh it before deleting it." }), { status: 412 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<><div id="app-shell" /><JourneyEntryEditor entry={entry} onClose={() => undefined} onSaved={() => undefined} onDeleted={() => undefined} /></>);

    await user.click(screen.getByRole("button", { name: "Delete thought" }));
    await user.click(screen.getByRole("button", { name: "Delete thought" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Refresh it before deleting it.");
    expect(screen.getByRole("button", { name: "Keep thought" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete thought" })).toBeTruthy();
  });
});
