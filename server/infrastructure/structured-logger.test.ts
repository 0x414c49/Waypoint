// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createStructuredLogger } from "./structured-logger.js";

describe("structured logger", () => {
  it("redacts private reflection, plan, and AI content", () => {
    let output = "";
    const destination = {
      write(chunk: string) {
        output += chunk;
      },
    };
    const logger = createStructuredLogger("info", destination);

    logger.info(
      {
        body: { reflection: "private reflection", content: "private plan wrapper" },
        planSource: "private yaml",
        aiContent: "private generated text",
        safeFact: "kept",
      },
      "safe event",
    );

    expect(output).toContain("[redacted]");
    expect(output).toContain("kept");
    expect(output).not.toContain("private reflection");
    expect(output).not.toContain("private plan wrapper");
    expect(output).not.toContain("private yaml");
    expect(output).not.toContain("private generated text");
  });
});
