import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";

const lightDashboard = {
  dataRevision: 1,
  generatedAt: "2026-09-27T08:00:00.000Z",
  today: "2026-09-27",
  timeZone: "Europe/Amsterdam",
  quarter: { id: "q4", title: "Q4", planRevision: 1 },
  state: "LIGHT",
  hero: { state: "LIGHT", reason: "NO_PLANNED_ITEM", task: null, timing: null, primaryAction: null, secondaryActions: [] },
  activeSession: null,
  upNext: null,
  optionalToday: null,
  activityPreview: { startDate: "2026-09-14", endDate: "2026-09-27", days: [] },
  milestoneSummary: null,
  decisionReviewsDue: { count: 0, items: [] },
};

describe("application shell", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(lightDashboard))));
  });

  it("opens Today with only completed product destinations", async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Today" })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Today" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Journey" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Quarter" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Decisions" })).toBeNull();
    expect(screen.getByText("Stored on this device")).toBeTruthy();
  });

  it("switches appearance with an accessible target", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "Use dark appearance" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("journey-theme")).toBe("dark");
  });
});
