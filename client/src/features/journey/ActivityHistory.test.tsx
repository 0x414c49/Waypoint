import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ActivityHistory } from "./ActivityHistory.js";

describe("ActivityHistory", () => {
  it("presents session facts as an aligned weekly calendar without streak language", () => {
    render(<ActivityHistory activity={{
      from: "2026-09-27",
      to: "2026-10-04",
      days: [
        { date: "2026-09-27", sessionSeconds: 0, level: 0 },
        { date: "2026-09-28", sessionSeconds: 600, level: 1 },
        { date: "2026-09-29", sessionSeconds: 1_800, level: 3 },
        { date: "2026-09-30", sessionSeconds: 0, level: 0 },
        { date: "2026-10-01", sessionSeconds: 3_600, level: 4 },
        { date: "2026-10-02", sessionSeconds: 0, level: 0 },
        { date: "2026-10-03", sessionSeconds: 0, level: 0 },
        { date: "2026-10-04", sessionSeconds: 0, level: 0 },
      ],
    }} />);

    expect(screen.getByText("1h 40m recorded")).toBeTruthy();
    expect(screen.getByText("across 3 learning days")).toBeTruthy();
    const calendar = screen.getByRole("list", { name: "8 days of recorded session activity" });
    expect(within(calendar).getAllByRole("listitem")).toHaveLength(8);
    const monday = within(calendar).getByRole("listitem", { name: "Sep 28, 2026: 10 minutes recorded" });
    expect(monday.getAttribute("data-level")).toBe("1");
    const nextSunday = within(calendar).getByRole("listitem", { name: "Oct 4, 2026: no recorded session time" });
    expect(nextSunday.getAttribute("data-level")).toBe("0");
    expect(calendar.querySelectorAll("[aria-hidden='true']")).toHaveLength(6);
    expect(calendar.querySelector("[style]")).toBeNull();
    expect(screen.getByText("Closed session time—quiet context, never a streak.")).toBeTruthy();
  });
});
