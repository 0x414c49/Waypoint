import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { DecisionListPage } from "./DecisionListPage.js";

function summary(index: number, status = "ACCEPTED", currentDueDate: string | null = null) {
  return {
    id: `decision-${index}`,
    title: `Decision ${index}`,
    status,
    decisionDate: "2026-09-29",
    quarterId: null,
    relatedTask: null,
    supersedesDecisionId: null,
    currentDueDate,
    updatedAt: "2026-09-29T10:00:00.000Z",
    href: `/api/decisions/decision-${index}`,
  };
}

afterEach(() => vi.unstubAllGlobals());

it("loads every due page instead of hiding decisions after the first page", async () => {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (!url.includes("review=due")) {
      return new Response(JSON.stringify({ items: [], nextCursor: null }));
    }
    if (url.includes("cursor=next-due-page")) {
      return new Response(JSON.stringify({ items: [summary(101)], nextCursor: null }));
    }
    return new Response(JSON.stringify({
      items: Array.from({ length: 100 }, (_, index) => summary(index + 1)),
      nextCursor: "next-due-page",
    }));
  }));

  render(<MemoryRouter><DecisionListPage /></MemoryRouter>);

  expect(await screen.findByText("Decision 101")).toBeTruthy();
  const readySection = screen.getByRole("heading", { name: "Ready to revisit" }).closest("section");
  expect(readySection).not.toBeNull();
  expect(within(readySection as HTMLElement).getAllByRole("link")).toHaveLength(101);
});

it("groups decisions by the next useful action without a status-filter control", async () => {
  const due = summary(2, "ACCEPTED", "2026-09-29");
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("review=due")) return new Response(JSON.stringify({ items: [due], nextCursor: null }));
    return new Response(JSON.stringify({
      items: [summary(1, "DRAFT"), due, summary(3, "ACCEPTED"), summary(4, "SUPERSEDED")],
      nextCursor: null,
    }));
  }));

  render(<MemoryRouter><DecisionListPage /></MemoryRouter>);

  expect(await screen.findByRole("heading", { name: "Drafts to continue" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Ready to revisit" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Choices in use" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Earlier choices" })).toBeTruthy();
  expect(screen.queryByRole("combobox", { name: "Filter by status" })).toBeNull();
  expect(screen.getAllByRole("link", { name: "Decision 2" })).toHaveLength(1);
});
