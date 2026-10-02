import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TaskDetailPage } from "./TaskDetailPage.js";

afterEach(() => vi.unstubAllGlobals());

const task = {
  id: "missed-item", status: "NOT_STARTED", etag: '"task-v1"', recommendationMode: "DEFAULT",
  displayPlan: { title: "Study timeouts", plannedDate: "2026-10-01", focusArea: null, milestone: null, source: "CURRENT" },
  displayPlanSource: "CURRENT", timing: { actualSecondsAtGeneratedAt: 0, activeStartedAt: null },
  latestOutcome: null, availableActions: ["START"],
};

const detail = { task, quarterId: "q4", sessionsHref: "/api/tasks/missed-item/sessions", sessions: [], reviews: [], thoughts: [], lifecycle: [] };

function renderDetail() {
  render(<MemoryRouter initialEntries={["/tasks/missed-item"]}><Routes>
    <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
    <Route path="/" element={<p>Today is open</p>} />
  </Routes></MemoryRouter>);
}

describe("past planned item", () => {
  it("can be started from its detail page and opens Today", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      new Response(JSON.stringify(init?.method === "POST" ? { dashboard: { dataRevision: 2 } } : detail)));
    vi.stubGlobal("fetch", fetchMock);
    renderDetail();

    await userEvent.setup().click(await screen.findByRole("button", { name: "Start session" }));

    expect(await screen.findByText("Today is open")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url, init]) =>
      String(url) === "/api/tasks/missed-item/start" && init?.method === "POST" && new Headers(init.headers).get("If-Match") === task.etag,
    )).toBe(true);
  });

  it("offers to pause the current session before switching", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method !== "POST") return new Response(JSON.stringify(detail));
      const body = JSON.parse(String(init.body)) as { activeSessionResolution?: unknown };
      if (body.activeSessionResolution) return new Response(JSON.stringify({ dashboard: { dataRevision: 3 } }));
      return new Response(JSON.stringify({
        code: "ACTIVE_SESSION_CONFLICT", detail: "Another session is running.",
        current: { activeSession: { id: "current-session", startedAt: "2026-10-02T09:00:00Z", task: { id: "current-item", title: "Current item", etag: '"current-v1"' } } },
      }), { status: 409 });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderDetail();

    await userEvent.setup().click(await screen.findByRole("button", { name: "Start session" }));
    await userEvent.setup().click(await screen.findByRole("button", { name: "Pause current and switch" }));

    expect(await screen.findByText("Today is open")).toBeTruthy();
    await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(2));
  });
});
