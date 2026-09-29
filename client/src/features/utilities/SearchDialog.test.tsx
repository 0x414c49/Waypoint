import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { SearchDialog } from "./SearchDialog.js";

afterEach(() => vi.unstubAllGlobals());

function CurrentPath() {
  return <output aria-label="Current path">{useLocation().pathname + useLocation().search}</output>;
}

function SearchHarness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(true);
  return <>
    <div id="app-shell"><button type="button">Open</button></div>
    <Routes><Route path="*" element={<CurrentPath />} /></Routes>
    {open ? <SearchDialog onClose={() => { onClose(); setOpen(false); }} /> : null}
  </>;
}

it("searches globally, opens the canonical Task route, and restores the background", async () => {
  const response = {
    query: "idempotency",
    groups: [{ type: "PLAN", items: [{
      contentType: "TASK", id: "retry-idempotency", title: "Idempotency", excerpt: "Retries should be safe.",
      quarterId: "quarter-1", focusAreaId: null, milestoneId: "week-1", taskId: "retry-idempotency",
      journeyEntryId: null, decisionId: null, occurredAt: null,
    }] }],
    nextCursor: null,
  };
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(response)));
  vi.stubGlobal("fetch", fetchMock);
  const onClose = vi.fn();
  const user = userEvent.setup();

  render(
    <MemoryRouter><SearchHarness onClose={onClose} /></MemoryRouter>,
  );

  const input = screen.getByRole("searchbox", { name: "Search your plan, Journey, and Decisions" });
  await waitFor(() => expect(document.activeElement).toBe(input));
  await user.type(input, "idempotency");
  const result = await screen.findByRole("link", { name: /Idempotency/ });
  expect(fetchMock).toHaveBeenCalledWith("/api/search?q=idempotency&limit=25", expect.objectContaining({ headers: { Accept: "application/json" } }));
  expect(document.getElementById("app-shell")?.inert).toBe(true);

  await user.click(result);

  expect((await screen.findByLabelText("Current path")).textContent).toBe("/tasks/retry-idempotency");
  expect(onClose).toHaveBeenCalledOnce();
  expect(document.getElementById("app-shell")?.inert).toBe(false);
});

it("opens an exact Journey thought with a stable deep link", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    query: "retry", groups: [{ type: "JOURNEY", items: [{
      contentType: "THOUGHT", id: "thought-1", title: "Idempotency", excerpt: "A retry needs one owner.",
      quarterId: null, focusAreaId: null, milestoneId: null, taskId: null, journeyEntryId: "thought-1", decisionId: null, occurredAt: "2026-11-03T17:00:00.000Z",
    }] }], nextCursor: null,
  }))));
  const user = userEvent.setup();
  render(<MemoryRouter><div id="app-shell" /><Routes><Route path="*" element={<><CurrentPath /><SearchDialog onClose={() => undefined} /></>} /></Routes></MemoryRouter>);

  await user.type(screen.getByRole("searchbox"), "retry");
  await user.click(await screen.findByRole("link", { name: /Idempotency/ }));

  expect((await screen.findByLabelText("Current path")).textContent).toBe("/journey?entryId=thought-1");
});
