import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { Dashboard, TaskProjection } from "../features/today/types.js";
import { ActiveSessionStrip } from "./ActiveSessionStrip.js";

function runningDashboard(status: "IN_PROGRESS" | "PAUSED"): Dashboard {
  const plan = { plannedDate: "2026-11-03", title: "Partial failure", tags: [], recommendationMode: "DEFAULT" as const };
  const task: TaskProjection = {
    id: "task-1", etag: "etag-task", status, currentPlan: plan,
    displayPlanSource: "CURRENT", displayPlan: plan,
    timing: { actualSecondsAtGeneratedAt: 125, firstStartedAt: "2026-11-03T10:00:00.000Z", runningSince: status === "IN_PROGRESS" ? "2026-11-03T10:00:00.000Z" : null },
    availableActions: [status === "IN_PROGRESS" ? "PAUSE" : "RESUME"],
  };
  return {
    dataRevision: 1, generatedAt: new Date().toISOString(), today: "2026-11-03", timeZone: "Europe/Amsterdam",
    quarter: { id: "q4", title: "Q4", planRevision: 1 }, state: status === "IN_PROGRESS" ? "RUNNING" : "PAUSED",
    hero: { state: status === "IN_PROGRESS" ? "RUNNING" : "PAUSED", reason: "ACTIVE", task, timing: task.timing, primaryAction: null, secondaryActions: [] },
    activeSession: null, upNext: null, optionalToday: null,
    activityPreview: { startDate: "2026-10-20", endDate: "2026-11-03", days: [] }, milestoneSummary: null,
    decisionReviewsDue: { count: 0, items: [] },
  };
}

describe("off-Today session strip", () => {
  it("shows elapsed truth and pauses through the task command", async () => {
    const dashboard = runningDashboard("IN_PROGRESS");
    const paused = runningDashboard("PAUSED");
    const update = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ task: paused.hero.task, activeSession: null, affectedTasks: [], dashboard: paused })));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<MemoryRouter><ActiveSessionStrip dashboard={dashboard} onUpdate={update} /></MemoryRouter>);

    expect(screen.getByText(/Running · 2:0/)).toBeTruthy();
    expect(screen.getByRole<HTMLAnchorElement>("link", { name: "Return to Today" }).getAttribute("href")).toBe("/");
    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/tasks/task-1/pause");
    expect(update).toHaveBeenCalledWith(paused);
  });

  it("offers Resume for paused work", () => {
    render(<MemoryRouter><ActiveSessionStrip dashboard={runningDashboard("PAUSED")} onUpdate={() => undefined} /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "Resume" })).toBeTruthy();
  });
});
