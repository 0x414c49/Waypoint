import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { DecisionEditor } from "./DecisionEditor.js";

it("keeps Accept separate from unsaved Draft edits", async () => {
  const save = vi.fn(async () => true);
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
  const context = screen.getByLabelText("What is going on?");
  const paragraph = context.querySelector("p")!;
  const range = document.createRange();
  range.selectNodeContents(paragraph);
  range.collapse(false);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  context.focus();
  await user.type(context, " More detail.");
  expect((screen.getByRole("button", { name: "Accept decision" }) as HTMLButtonElement).disabled).toBe(true);
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ context: "A retry crosses services. More detail." }));
  expect(accept).not.toHaveBeenCalled();
});

it("does not call a pristine new decision saved and only clears edits after a confirmed save", async () => {
  const save = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const user = userEvent.setup();
  render(
    <DecisionEditor
      initial={{ title: "", constraints: [], options: [], assumptions: [] }}
      initialSaved={false}
      busy={false}
      canAccept={false}
      onSave={save}
    />,
  );

  expect(screen.getByRole("status").textContent).toBe("Not saved yet");
  await user.type(screen.getByLabelText("Title"), "A local decision");
  expect(screen.getByRole("status").textContent).toBe("Unsaved changes");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  expect(screen.getByRole("status").textContent).toBe("Unsaved changes");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  expect(screen.getByRole("status").textContent).toBe("Draft saved");
});

it("keeps a title-only Draft easy to save and hides deeper prompts until requested", async () => {
  const save = vi.fn(async () => true);
  const user = userEvent.setup();
  render(
    <DecisionEditor
      initial={{ title: "", constraints: [], options: [], assumptions: [] }}
      initialSaved={false}
      busy={false}
      canAccept={false}
      onSave={save}
    />,
  );

  expect(screen.getByLabelText(/^Decision date/)).toBeTruthy();
  const optionalDetails = screen.getByText(/Add more detail/).closest("details");
  expect(optionalDetails?.open).toBe(false);
  await user.type(screen.getByLabelText("Title"), "Keep retries at the edge");
  await user.click(screen.getByRole("button", { name: "Save draft" }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ title: "Keep retries at the edge" }));

  await user.click(screen.getByText(/Add more detail/));
  expect(optionalDetails?.open).toBe(true);
  expect(screen.getByLabelText(/^Decision date/)).toBeTruthy();
  expect(screen.getByLabelText(/Constraints/)).toBeTruthy();
  expect(screen.getByLabelText("What might change your mind?")).toBeTruthy();
  expect(screen.getByLabelText(/First review date/)).toBeTruthy();
});

it("requires a chosen later date when postponing a review", async () => {
  const { ReviewComposer } = await import("./ReviewComposer.js");
  const submit = vi.fn(async () => true);
  const user = userEvent.setup();
  render(<ReviewComposer busy={false} onSubmit={submit} />);

  expect((screen.getByRole("button", { name: "Add review" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByRole("radio", { checked: true })).toBeNull();
  await user.click(screen.getByRole("radio", { name: "Postpone review" }));
  expect((screen.getByLabelText("Review later") as HTMLInputElement).required).toBe(true);
  expect(screen.queryByLabelText("What changed or still holds?")).toBeNull();
  await user.type(screen.getByLabelText("Review later"), "2026-12-01");
  await user.click(screen.getByRole("button", { name: "Postpone review" }));
  expect(submit).toHaveBeenCalledWith({ outcome: "DEFERRED", nextReviewDate: "2026-12-01" });
  expect(screen.queryByRole("radio", { checked: true })).toBeNull();
  expect((screen.getByRole("button", { name: "Add review" }) as HTMLButtonElement).disabled).toBe(true);
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

  expect(screen.getByLabelText("What changed or still holds?").textContent).toBe("The load profile changed.");
  expect((screen.getByLabelText("Next review date (optional)") as HTMLInputElement).value).toBe("2026-12-01");
});
