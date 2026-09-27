import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { App } from "./App.js";

describe("foundation shell", () => {
  it("shows an honest readiness state without dead product navigation", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Your learning space is ready." })).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.getByText("Stored locally on this device")).toBeTruthy();
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
