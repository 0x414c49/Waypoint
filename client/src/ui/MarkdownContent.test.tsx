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

  it("keeps remote https images but strips data: URI sources (ADR-0015)", () => {
    const { container, rerender } = render(
      <MarkdownContent>
        {"![hosted](https://example.com/pic.png)"}
      </MarkdownContent>,
    );
    expect(container.querySelector('img[src="https://example.com/pic.png"]')).toBeTruthy();

    rerender(
      <MarkdownContent>
        {"![inline](data:image/png;base64,iVBORw0KGgo=)"}
      </MarkdownContent>,
    );
    expect(container.querySelector('img[src^="data:"]')).toBeNull();
  });
});
