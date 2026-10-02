import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";
import { AppShell } from "./AppShell.js";

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
  leftovers: { totalCount: 0, items: [] },
  activityPreview: { startDate: "2026-09-14", endDate: "2026-09-27", days: [] },
  milestoneSummary: null,
  decisionReviewsDue: { count: 0, items: [] },
};

describe("application shell", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/auth/session")) return new Response(JSON.stringify({ authenticated: true, user: { id: "local-user", name: "Local user", email: "local@example.test", timeZone: "UTC", role: "OWNER", createdAt: "2026-09-27T08:00:00.000Z" } }));
      return new Response(JSON.stringify(lightDashboard));
    }));
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
    expect(screen.getAllByRole("link", { name: "Quarter" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Tech choices" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Stored on this device")).toBeTruthy();
  });

  it("switches appearance with an accessible target", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "Use dark appearance" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("journey-theme")).toBe("dark");
  });

  it("offers a keyboard skip link and moves focus to main content after route navigation", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<p>Today body</p>} />
            <Route path="/quarter" element={<p>Quarter body</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    await user.tab();
    const skipLink = screen.getByRole("link", { name: "Skip to main content" });
    expect(document.activeElement).toBe(skipLink);
    await user.click(skipLink);
    expect(document.activeElement).toBe(screen.getByRole("main"));

    await user.click(screen.getAllByRole("link", { name: "Quarter" })[0]!);
    expect(await screen.findByText("Quarter body")).toBeTruthy();
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    expect(document.activeElement).toBe(screen.getByRole("main"));
  });
});
