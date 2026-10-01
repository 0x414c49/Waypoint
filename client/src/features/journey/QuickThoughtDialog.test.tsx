import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QuickThoughtDialog } from "./QuickThoughtDialog.js";

describe("Quick Thought", () => {
  it("focuses text immediately and lets the inferred task be removed", async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValue(undefined);
    render(<QuickThoughtDialog inferredContext={{ taskId: "task-1", taskTitle: "Partial failure" }} onClose={() => undefined} onSave={save} />);

    const textarea = screen.getByRole("textbox", { name: "What is worth keeping?" });
    await waitFor(() => expect(document.activeElement).toBe(textarea));
    expect(screen.getByText("Partial failure")).toBeTruthy();
    await user.type(textarea, "Retries need one owner.");
    await user.click(screen.getByRole("button", { name: "Curious" }));
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await user.click(screen.getByRole("button", { name: "Save thought" }));

    expect(save).toHaveBeenCalledWith("Retries need one owner.", null, "curious");
  });

  it("requires only text and keeps save errors inside the dialog", async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockRejectedValue(new Error("The thought is still on this screen."));
    render(<QuickThoughtDialog inferredContext={null} onClose={() => undefined} onSave={save} />);

    await user.click(screen.getByRole("button", { name: "Save thought" }));
    expect(screen.getByRole("alert").textContent).toContain("Write a thought");
    await user.type(screen.getByRole("textbox"), "One useful thing");
    await user.click(screen.getByRole("button", { name: "Save thought" }));
    expect((await screen.findByRole("alert")).textContent).toContain("still on this screen");
  });

  it("saves an explicitly unlinked thought when no relationship is shown", async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValue(undefined);
    render(<QuickThoughtDialog inferredContext={null} onClose={() => undefined} onSave={save} />);

    await user.type(screen.getByRole("textbox"), "A standalone thought");
    await user.click(screen.getByRole("button", { name: "Save thought" }));

    expect(save).toHaveBeenCalledWith("A standalone thought", null, null);
  });

  it("inerts the Journey background and restores focus to its opener", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return <><div id="app-shell"><button type="button" onClick={() => setOpen(true)}>Open thought</button></div>{open ? <QuickThoughtDialog inferredContext={null} onClose={() => setOpen(false)} onSave={async () => undefined} /> : null}</>;
    }
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open thought" });
    await user.click(opener);

    const background = opener.parentElement as HTMLElement;
    await waitFor(() => expect(background.inert).toBe(true));
    expect(document.activeElement).toBe(screen.getByRole("textbox"));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(background.inert).toBe(false);
    expect(document.activeElement).toBe(opener);
  });
});
