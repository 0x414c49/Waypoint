import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { DecisionEditor } from "./DecisionEditor.js";

it("keeps Accept separate from unsaved Draft edits", async () => {
  const save = vi.fn(async () => undefined);
  const accept = vi.fn(async () => undefined);
  const user = userEvent.setup();
  render(
    <DecisionEditor
      initial={{ title: "Retry ownership", decisionDate: "2026-09-29", context: "A retry crosses services.", decision: "One layer owns retries.", constraints: [], options: [], assumptions: [] }}
      busy={false}
      canAccept
      onSave={save}
      onAccept={accept}
    />,
  );

  expect((screen.getByRole("button", { name: "Accept decision" }) as HTMLButtonElement).disabled).toBe(false);
  await user.type(screen.getByLabelText("Context"), " More detail.");
  expect((screen.getByRole("button", { name: "Accept decision" }) as HTMLButtonElement).disabled).toBe(true);
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ context: "A retry crosses services. More detail." }));
  expect(accept).not.toHaveBeenCalled();
});

it("requires a chosen later date when postponing a review", async () => {
  const { ReviewComposer } = await import("./ReviewComposer.js");
  const submit = vi.fn(async () => true);
  const user = userEvent.setup();
  render(<ReviewComposer busy={false} onSubmit={submit} />);

  await user.click(screen.getByRole("radio", { name: "Postpone review" }));
  expect((screen.getByLabelText("Review later") as HTMLInputElement).required).toBe(true);
  await user.type(screen.getByLabelText("Review later"), "2026-12-01");
  await user.click(screen.getByRole("button", { name: "Postpone review" }));
  expect(submit).toHaveBeenCalledWith({ outcome: "DEFERRED", nextReviewDate: "2026-12-01" });
});

it("keeps typed review evidence when the append fails", async () => {
  const { ReviewComposer } = await import("./ReviewComposer.js");
  const submit = vi.fn(async () => false);
  const user = userEvent.setup();
  render(<ReviewComposer busy={false} onSubmit={submit} />);

  await user.click(screen.getByRole("radio", { name: "I would adjust it" }));
  await user.type(screen.getByLabelText("What changed or still holds?"), "The load profile changed.");
  await user.type(screen.getByLabelText("Next review date (optional)"), "2026-12-01");
  await user.click(screen.getByRole("button", { name: "Add review" }));

  expect((screen.getByLabelText("What changed or still holds?") as HTMLTextAreaElement).value).toBe("The load profile changed.");
  expect((screen.getByLabelText("Next review date (optional)") as HTMLInputElement).value).toBe("2026-12-01");
});
