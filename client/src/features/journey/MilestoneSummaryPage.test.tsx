import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MilestoneSummaryPage } from "./MilestoneSummaryPage.js";
import type { JourneyEntry } from "./types.js";

afterEach(() => vi.unstubAllGlobals());

describe("milestone summary", () => {
  it("distinguishes period-end status from current status", async () => {
    const summary = {
      dataRevision: 4,
      milestone: {
        id: "week-1", quarterId: "quarter-1", title: "Week 1",
        startDate: "2026-09-28", endDate: "2026-10-04", mode: "STANDARD", displaySource: "CURRENT",
      },
      counts: { planned: 1, touched: 1, finished: 1, skipped: 0, open: 0 },
      effortDuringPeriod: { sessionSeconds: 600, sessionCount: 1 },
      eventsDuringPeriod: { finished: 1, skipped: 0, reopened: 0, carriedForward: 0, decisionsReviewed: 0, thoughtsCaptured: 0 },
      outcomes: { achieved: 1, partial: 0, notAchieved: 0 },
      taskRows: [{
        task: {
          id: "task-1", status: "FINISHED", etag: "etag-1", recommendationMode: "DEFAULT",
          displayPlan: { title: "Late finish", plannedDate: "2026-10-01", milestone: null, source: "CURRENT" },
          timing: { actualSecondsAtGeneratedAt: 600, activeStartedAt: null },
          latestOutcome: "ACHIEVED", availableActions: [],
        },
        statusAtPeriodEnd: "PAUSED", currentStatus: "FINISHED", actualSecondsAllTime: 600,
      }],
      thoughts: [], changedMyMindCount: 0, openWork: [], reflection: { prompt: null, entry: null },
    };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(summary))));

    render(
      <MemoryRouter initialEntries={["/quarters/quarter-1/milestones/week-1/summary"]}>
        <Routes>
          <Route path="/quarters/:quarterId/milestones/:milestoneId/summary" element={<MilestoneSummaryPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("paused at period end · now finished")).toBeTruthy();
  });

  it("deletes a weekly thought and refreshes the reflection summary", async () => {
    const entry: JourneyEntry = {
      id: "weekly-thought-1",
      etag: '"weekly-thought-v1"',
      type: "WEEKLY_REFLECTION",
      occurredAt: "2026-10-04T17:00:00.000Z",
      localDate: "2026-10-04",
      text: "Reliability is about clear boundaries.",
      tags: [],
      changedMyMind: true,
      relatedTask: null,
      relatedMilestone: { id: "week-1", quarterId: "quarter-1", title: "Week 1" },
      relatedDecision: null,
      createdAt: "2026-10-04T17:00:00.000Z",
      updatedAt: null,
    };
    const before = {
      dataRevision: 4,
      milestone: { id: "week-1", quarterId: "quarter-1", title: "Week 1", startDate: "2026-09-28", endDate: "2026-10-04", mode: "STANDARD", displaySource: "CURRENT" },
      counts: { planned: 0, touched: 0, finished: 0, skipped: 0, open: 0 },
      effortDuringPeriod: { sessionSeconds: 0, sessionCount: 0 },
      eventsDuringPeriod: { finished: 0, skipped: 0, reopened: 0, carriedForward: 0, decisionsReviewed: 0, thoughtsCaptured: 1 },
      outcomes: { achieved: 0, partial: 0, notAchieved: 0 },
      taskRows: [],
      thoughts: [entry],
      changedMyMindCount: 1,
      openWork: [],
      reflection: { prompt: "What should the next part of the journey remember?", entry },
    };
    const after = {
      ...before,
      dataRevision: 5,
      eventsDuringPeriod: { ...before.eventsDuringPeriod, thoughtsCaptured: 0 },
      thoughts: [],
      changedMyMindCount: 0,
      reflection: { ...before.reflection, entry: null },
    };
    let summaryReads = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      const value = summaryReads++ === 0 ? before : after;
      return new Response(JSON.stringify(value));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/quarters/quarter-1/milestones/week-1/summary"]}>
        <Routes>
          <Route path="/quarters/:quarterId/milestones/:milestoneId/summary" element={<MilestoneSummaryPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText(entry.text);
    await user.click(screen.getByRole("button", { name: "Edit weekly thought" }));
    await user.click(screen.getByRole("button", { name: "Delete thought" }));
    await user.click(screen.getByRole("button", { name: "Delete thought" }));

    expect(await screen.findByText("What should the next part of the journey remember?")).toBeTruthy();
    expect(screen.queryByText(entry.text)).toBeNull();
    const deleteCall = fetchMock.mock.calls.find((call) => call[1]?.method === "DELETE");
    expect(new Headers(deleteCall?.[1]?.headers).get("If-Match")).toBe(entry.etag);
  });
});
