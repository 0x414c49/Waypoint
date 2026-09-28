import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MilestoneSummaryPage } from "./MilestoneSummaryPage.js";

afterEach(() => vi.unstubAllGlobals());

describe("milestone summary", () => {
  it("distinguishes period-end status from current status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
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
    }))));

    render(
      <MemoryRouter initialEntries={["/quarters/quarter-1/milestones/week-1/summary"]}>
        <Routes>
          <Route path="/quarters/:quarterId/milestones/:milestoneId/summary" element={<MilestoneSummaryPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("paused at period end · now finished")).toBeTruthy();
  });
});
