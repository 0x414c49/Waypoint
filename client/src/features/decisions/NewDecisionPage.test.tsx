import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import type { DecisionDetail } from "./types.js";

const api = vi.hoisted(() => ({
  createDecision: vi.fn(),
  saveDecision: vi.fn(),
}));

vi.mock("./api.js", () => api);

import { NewDecisionPage } from "./NewDecisionPage.js";

const created = {
  id: "decision-retry",
  etag: '"decision-created"',
  title: "Retry ownership",
} as DecisionDetail;

it("reuses a created Draft when saving its full reasoning must be retried", async () => {
  api.createDecision.mockResolvedValue(created);
  api.saveDecision
    .mockRejectedValueOnce(new Error("The local write was interrupted."))
    .mockResolvedValueOnce({ ...created, etag: '"decision-saved"' });
  const user = userEvent.setup();

  render(<MemoryRouter><NewDecisionPage /></MemoryRouter>);
  await user.type(screen.getByLabelText("Title"), "Retry ownership");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  expect((await screen.findByRole("alert")).textContent).toContain("The local write was interrupted.");

  await user.click(screen.getByRole("button", { name: "Save draft" }));
  expect(api.createDecision).toHaveBeenCalledTimes(1);
  expect(api.saveDecision).toHaveBeenCalledTimes(2);
  expect(api.saveDecision).toHaveBeenLastCalledWith(
    "decision-retry",
    '"decision-created"',
    expect.objectContaining({ title: "Retry ownership" }),
  );
});
