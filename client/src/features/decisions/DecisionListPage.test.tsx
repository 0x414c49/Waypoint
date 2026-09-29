import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { DecisionListPage } from "./DecisionListPage.js";

function summary(index: number) {
  return {
    id: `decision-${index}`,
    title: `Decision ${index}`,
    status: "ACCEPTED",
    decisionDate: "2026-09-29",
    quarterId: null,
    relatedTask: null,
    supersedesDecisionId: null,
    currentDueDate: "2026-09-29",
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
  expect(screen.getByText("101")).toBeTruthy();
});
