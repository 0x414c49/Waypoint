import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownContent } from "./MarkdownContent.js";

describe("MarkdownContent", () => {
  it("turns bare URLs in prose into clickable links", () => {
    render(
      <MarkdownContent>
        {"Take A Tour of Go (https://go.dev/tour/) and Effective Go (https://go.dev/doc/effective_go)."}
      </MarkdownContent>,
    );

    expect(screen.getByRole("link", { name: "https://go.dev/tour/" }).getAttribute("href"))
      .toBe("https://go.dev/tour/");
    expect(screen.getByRole("link", { name: "https://go.dev/doc/effective_go" }).getAttribute("href"))
      .toBe("https://go.dev/doc/effective_go");
  });
});
