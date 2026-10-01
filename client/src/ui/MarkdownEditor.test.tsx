import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { MarkdownEditor } from "./MarkdownEditor.js";

describe("Markdown editor", () => {
  it("inserts a table and provides contextual row and table controls", async () => {
    const user = userEvent.setup();
    let value = "";
    const update = (next: string) => { value = next; };
    render(<MarkdownEditor value={value} onChange={update} ariaLabel="Session notes" />);

    await user.click(screen.getByRole("button", { name: "Insert table" }));
    const textbox = screen.getByRole("textbox", { name: "Session notes" });
    const table = within(textbox).getByRole("table");
    expect(table.querySelectorAll("tr")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Add row below" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Add row below" }));
    expect(table.querySelectorAll("tr")).toHaveLength(4);
    expect(value).toContain("|");
    await user.click(screen.getByRole("button", { name: "Remove table" }));
    expect(textbox.querySelector("table")).toBeNull();
  });
});
