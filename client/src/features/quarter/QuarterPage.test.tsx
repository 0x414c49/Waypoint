import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QuarterPage } from "./QuarterPage.js";
import { PlanImportPage } from "./PlanImportPage.js";

afterEach(() => vi.unstubAllGlobals());

const quarter = {
  id: "q4-2026", title: "Q4 Engineering Growth", startDate: "2026-10-01", endDate: "2026-12-31",
  phase: "CURRENT", planRevision: 1, etag: '"quarter-v1"', successCriteria: [{ id: "criterion", text: "Ship a reliable service", position: 0 }],
  focusAreas: [{ id: "systems", name: "Systems Reliability", description: "Learn to design failure behavior.", position: 0 }],
  milestones: [{ id: "week-1", title: "Week 1", startDate: "2026-10-05", endDate: "2026-10-09", mode: "STANDARD", position: 0, taskCount: 1 }],
  tasks: [{ id: "timeouts", title: "Study timeouts", plannedDate: "2026-10-06", focusAreaId: "systems", milestoneId: "week-1", recommendationMode: "DEFAULT" }],
};

function routeApp(initialEntry: string) {
  return <MemoryRouter initialEntries={[initialEntry]}><Routes>
    <Route path="/quarter" element={<QuarterPage />} />
    <Route path="/quarter/import" element={<PlanImportPage />} />
    <Route path="/quarter/:quarterId" element={<QuarterPage />} />
    <Route path="/quarter/:quarterId/focus-areas/:focusAreaId" element={<QuarterPage />} />
    <Route path="/quarter/:quarterId/milestones/:milestoneId" element={<QuarterPage />} />
    <Route path="/quarter/:quarterId/import" element={<PlanImportPage />} />
  </Routes></MemoryRouter>;
}

describe("Quarter plan navigation", () => {
  it("shows the partial opening week when a Quarter starts midweek", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/dashboard") return new Response(JSON.stringify({ today: "2026-10-01" }));
      if (url === "/api/quarters") return new Response(JSON.stringify({ items: [quarter] }));
      return new Response(JSON.stringify(quarter));
    }));
    render(routeApp("/quarter/q4-2026"));

    expect(await screen.findByText("Oct 1–Oct 4, 2026")).toBeTruthy();
    expect(screen.getByText("Quarter opens")).toBeTruthy();
    expect(screen.getByText("This week")).toBeTruthy();
  });

  it("keeps previous Quarters available in the history picker", async () => {
    const previous = { ...quarter, id: "q3-2026", title: "Q3 2026", startDate: "2026-07-01", endDate: "2026-09-30", phase: "PAST", tasks: [] };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/dashboard") return new Response(JSON.stringify({ today: "2026-11-03" }));
      if (url === "/api/quarters") return new Response(JSON.stringify({ items: [
        { id: quarter.id, title: quarter.title, startDate: quarter.startDate, endDate: quarter.endDate, phase: "CURRENT", planRevision: 1, etag: quarter.etag },
        { id: previous.id, title: previous.title, startDate: previous.startDate, endDate: previous.endDate, phase: "PAST", planRevision: 1, etag: "past-etag" },
      ] }));
      return new Response(JSON.stringify(url.endsWith("q3-2026") ? previous : quarter));
    }));
    const user = userEvent.setup();
    render(routeApp("/quarter/q4-2026"));

    const picker = await screen.findByRole("combobox", { name: "Choose quarter" });
    expect(screen.getByRole("group", { name: "Previous quarters" })).toBeTruthy();
    await user.selectOptions(picker, "q3-2026");
    expect(await screen.findByRole("heading", { name: "Q3 2026" })).toBeTruthy();
  });

  it("shows intent and opens canonical Focus Area and Milestone views", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/quarters") return new Response(JSON.stringify({ items: [{ id: "q4-2026", title: quarter.title, startDate: quarter.startDate, endDate: quarter.endDate, phase: "CURRENT", planRevision: 1, etag: quarter.etag }] }));
      return new Response(JSON.stringify(quarter));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(routeApp("/quarter/q4-2026"));

    expect(await screen.findByRole("heading", { name: "Q4 Engineering Growth" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Plan details" }));
    expect(screen.getByText("Ship a reliable service")).toBeTruthy();
    await user.click(screen.getByRole("link", { name: "Systems Reliability" }));
    expect(await screen.findByRole("heading", { name: "Systems Reliability" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Study timeouts" }).getAttribute("href")).toBe("/tasks/timeouts");
    await user.click(screen.getByRole("link", { name: /Back to Quarter/ }));
    await user.click(await screen.findByRole("button", { name: "Plan details" }));
    await user.click(screen.getByRole("link", { name: /Week 1/ }));
    expect(await screen.findByRole("heading", { name: "Week 1" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "View what happened during this milestone" }).getAttribute("href"))
      .toBe("/quarters/q4-2026/milestones/week-1/summary");
  });

  it("offers a working import path for an explicitly empty Quarter store", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ items: [] }))));
    const user = userEvent.setup();
    render(routeApp("/quarter"));
    expect(await screen.findByRole("heading", { name: "No Quarter is loaded yet." })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Add a learning plan" }));
    expect(await screen.findByRole("heading", { name: "Bring in a learning plan" })).toBeTruthy();
    expect(screen.getByLabelText("Plan content")).toBeTruthy();
  });

  it("shows between-quarter guidance only when no Quarter is current", async () => {
    const future = { ...quarter, id: "q-next", title: "Q1 2027", startDate: "2027-01-01", endDate: "2027-03-31", phase: "FUTURE" };
    const past = { ...quarter, id: "q-past", title: "Q3 2026", startDate: "2026-07-01", endDate: "2026-09-30", phase: "PAST" };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/quarters") return new Response(JSON.stringify({ items: [future, past] }));
      return new Response(JSON.stringify(future));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = render(routeApp("/quarter/q-next"));
    expect(await screen.findByText(/Between quarters/)).toBeTruthy();
    unmount();

    const current = { ...quarter, id: "q-current", title: "Q4 2026", phase: "CURRENT" };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/quarters") return new Response(JSON.stringify({ items: [current, past] }));
      return new Response(JSON.stringify(past));
    }));
    render(routeApp("/quarter/q-past"));
    expect(await screen.findByRole("heading", { name: "Q3 2026" })).toBeTruthy();
    expect(screen.queryByText(/Between quarters/)).toBeNull();
  });

  it("keeps the Quarter open when export fails and offers an export retry", async () => {
    let exports = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/quarters") return new Response(JSON.stringify({ items: [{ id: quarter.id, title: quarter.title, startDate: quarter.startDate, endDate: quarter.endDate, phase: quarter.phase, planRevision: 1, etag: quarter.etag }] }));
      if (url === "/api/plans/export/q4-2026") {
        exports += 1;
        return new Response(JSON.stringify({ detail: "Export is temporarily unavailable." }), { status: 503 });
      }
      return new Response(JSON.stringify(quarter));
    }));
    const user = userEvent.setup();
    render(routeApp("/quarter/q4-2026"));
    expect(await screen.findByRole("heading", { name: "Q4 Engineering Growth" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Export plan" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Export is temporarily unavailable.");
    expect(screen.getByRole("heading", { name: "Q4 Engineering Growth" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Try export again" }));
    await waitFor(() => expect(exports).toBe(2));
    expect(screen.getByRole("heading", { name: "Q4 Engineering Growth" })).toBeTruthy();
  });
});
