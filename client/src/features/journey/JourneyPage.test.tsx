import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { JourneyPage } from "./JourneyPage.js";

afterEach(() => vi.unstubAllGlobals());

it("opens an exact thought from a global-search deep link even outside the current timeline page", async () => {
  const entry = {
    id: "thought-outside-page", etag: '"journey-thought"', type: "THOUGHT",
    occurredAt: "2026-06-02T10:00:00.000Z", localDate: "2026-06-02",
    text: "This older thought opens directly from search.", tags: [], changedMyMind: false,
    relatedTask: null, relatedMilestone: null, relatedDecision: null,
    createdAt: "2026-06-02T10:00:00.000Z", updatedAt: null,
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith("/api/journey/thought-outside-page")) return new Response(JSON.stringify(entry));
    if (url.startsWith("/api/journey")) return new Response(JSON.stringify({ items: [], nextCursor: null }));
    if (url === "/api/dashboard") return new Response(JSON.stringify({ today: "2026-11-03" }));
    if (url.startsWith("/api/activity")) return new Response(JSON.stringify({ from: "2025-11-04", to: "2026-11-03", days: [] }));
    if (url.startsWith("/api/tasks")) return new Response(JSON.stringify({ items: [], nextCursor: null }));
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  render(
    <MemoryRouter initialEntries={["/journey?entryId=thought-outside-page"]}>
      <Routes><Route path="/journey" element={<JourneyPage />} /></Routes>
    </MemoryRouter>,
  );

  const matchingHeading = await screen.findByText("Matching Journey entry");
  expect(matchingHeading).toBeTruthy();
  expect(document.activeElement).toBe(matchingHeading);
  expect(screen.getByText(entry.text)).toBeTruthy();
  expect(screen.queryByText("No entries here yet.")).toBeNull();
  expect(fetchMock).toHaveBeenCalledWith("/api/journey/thought-outside-page", expect.objectContaining({ headers: { Accept: "application/json" } }));
});
