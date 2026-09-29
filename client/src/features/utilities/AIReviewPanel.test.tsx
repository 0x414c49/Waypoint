import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { AIReviewPanel } from "./AIReviewPanel.js";

afterEach(() => vi.unstubAllGlobals());

it("labels the local deterministic preview and keeps repeated advice as append-only history", async () => {
  const makeReview = (id: string) => ({
    id, targetType: "TASK", targetId: "task-1", provider: "stub", model: "deterministic-v1",
    summary: `Starting point ${id}.`, strengths: ["Original context remains."], gaps: ["No progress scoring."],
    suggestedFollowUp: "Compare with your evidence.", questions: ["What changed?"],
    generatedAt: "2026-11-03T17:00:00.000Z", timeZoneAtGeneration: "Europe/Amsterdam",
  });
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] })))
    .mockResolvedValueOnce(new Response(JSON.stringify(makeReview("review-1"))))
    .mockResolvedValueOnce(new Response(JSON.stringify(makeReview("review-2"))));
  vi.stubGlobal("fetch", fetchMock);
  const user = userEvent.setup();
  render(<AIReviewPanel targetType="TASK" targetId="task-1" targetTitle="Retries" />);

  expect(await screen.findByRole("button", { name: "Generate reflection" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Generate reflection" }));
  expect(await screen.findByText("Starting point review-1.")).toBeTruthy();
  expect(screen.getByText("Generated advice · stub")).toBeTruthy();
  expect(screen.getByText(/deterministic preview/)).toBeTruthy();

  await user.click(screen.getByRole("button", { name: "Generate another" }));
  expect(await screen.findByText("Starting point review-2.")).toBeTruthy();
  expect(screen.getByRole("list", { name: "Generated advice history" }).querySelectorAll(":scope > li")).toHaveLength(2);
  expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/ai/review/task/task-1");
  expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({});
});

it("leaves the optional panel usable after advice generation fails", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: "AI_REVIEW_FAILED", detail: "No advice was saved." }), { status: 503 }));
  vi.stubGlobal("fetch", fetchMock);
  const user = userEvent.setup();
  render(<AIReviewPanel targetType="QUARTER" targetId="q4" targetTitle="Q4" />);

  await user.click(await screen.findByRole("button", { name: "Generate reflection" }));

  expect((await screen.findByRole("alert")).textContent).toBe("No advice was saved.");
  expect(screen.getByRole("button", { name: "Generate reflection" })).toBeTruthy();
});
