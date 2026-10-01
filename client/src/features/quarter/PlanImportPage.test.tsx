import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PlanImportPage } from "./PlanImportPage.js";
import { QuarterPage } from "./QuarterPage.js";

afterEach(() => vi.unstubAllGlobals());

const preview = {
  previewToken: "plan-preview-token", expiresAt: "2026-11-03T17:30:00.000Z", mode: "UPDATE_QUARTER", quarterId: "q4-2026",
  basePlanRevision: 3, baseEtag: '"quarter-three"',
  summary: { added: 0, changed: 1, removed: 0, historicalPreserved: 1, conflicts: 1 },
  changes: [{ kind: "CONFLICT", operation: "UPDATE", entityType: "TASK", id: "active-task", label: "Active learning item", explanation: "Current plan intent changes; the captured context and active work remain unchanged.", before: { title: "Earlier title" }, after: { title: "Updated title" }, historyPreserved: true }],
  requiredAcknowledgements: [{ id: "preserve-active:active-task", code: "PRESERVE_ACTIVE_WORK", description: "Keep the current running work and its Sessions unchanged while applying this plan change." }],
};

const quarterDetail = {
  id: "q4-2026", title: "Q4 Engineering Growth", startDate: "2026-10-01", endDate: "2026-12-31", phase: "CURRENT", planRevision: 4, etag: '"quarter-four"',
  successCriteria: [], focusAreas: [], milestones: [], tasks: [],
};

function routed() {
  return <MemoryRouter initialEntries={["/quarter/q4-2026/import"]}><Routes>
    <Route path="/quarter/:quarterId/import" element={<PlanImportPage />} />
    <Route path="/quarter/:quarterId" element={<QuarterPage />} />
  </Routes></MemoryRouter>;
}

describe("plan preview and apply", () => {
  it("keeps Apply unavailable until active-work acknowledgement, then returns to Quarter", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); calls.push({ url, ...(init ? { init } : {}) });
      if (url === "/api/plans/preview") return new Response(JSON.stringify(preview));
      if (url === "/api/plans/apply") return new Response(JSON.stringify({ mode: "UPDATE_QUARTER", quarterId: "q4-2026", planRevision: 4, etag: '"quarter-four"', changed: true }));
      if (url === "/api/quarters") return new Response(JSON.stringify({ items: [] }));
      return new Response(JSON.stringify(quarterDetail));
    }));
    const user = userEvent.setup();
    render(routed());
    await user.type(screen.getByLabelText("Plan content"), "version: 1\n");
    await user.click(screen.getByRole("button", { name: "Validate and preview" }));

    expect(await screen.findByRole("heading", { name: "Review before applying" })).toBeTruthy();
    expect(screen.getByText(/sessions, reflections, technical choices, outcomes/)).toBeTruthy();
    const applyButton = screen.getByRole("button", { name: "Apply plan" }) as HTMLButtonElement;
    expect(applyButton.disabled).toBe(true);
    await user.click(screen.getByRole("checkbox", { name: preview.requiredAcknowledgements[0]!.description }));
    expect(applyButton.disabled).toBe(false);
    await user.click(applyButton);

    expect(await screen.findByRole("heading", { name: "Q4 Engineering Growth" })).toBeTruthy();
    const applyCall = calls.find((call) => call.url === "/api/plans/apply")!;
    expect(new Headers(applyCall.init?.headers).get("If-Match")).toBe(preview.baseEtag);
    expect(new Headers(applyCall.init?.headers).get("Idempotency-Key")).toBeTruthy();
    expect(JSON.parse(String(applyCall.init?.body))).toEqual({ previewToken: preview.previewToken, acknowledgementIds: [preview.requiredAcknowledgements[0]!.id] });
  });

  it("shows strict validation failures without exposing Apply", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code: "VALIDATION_FAILED", detail: "The plan contains an unknown field.", errors: ["/tasks/0/surprise: unknown field"] }), { status: 422 })));
    const user = userEvent.setup();
    render(routed());
    await user.type(screen.getByLabelText("Plan content"), "version: 1\n");
    await user.click(screen.getByRole("button", { name: "Validate and preview" }));
    expect(await screen.findByText("The plan contains an unknown field.")).toBeTruthy();
    expect(screen.getByText("/tasks/0/surprise: unknown field")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Apply plan" })).toBeNull();
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
  });
});
