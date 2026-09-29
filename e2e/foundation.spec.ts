import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse, stringify } from "yaml";

const q4Fixture = readFileSync(resolve(process.cwd(), "planning/fixtures/q4-2026-engineering-growth.yaml"), "utf8");

function q4PlanWithout(taskId: string): string {
  const plan = parse(q4Fixture) as { tasks: Array<{ id: string }> };
  plan.tasks = plan.tasks.filter((task) => task.id !== taskId);
  return stringify(plan, { lineWidth: 0 });
}

async function createAcceptedDecision(page: Page, title: string, keySuffix: string): Promise<string> {
  const origin = "http://127.0.0.1:4173";
  const createdResponse = await page.request.post("/api/decisions", {
    headers: { Origin: origin, "Idempotency-Key": `e2e-reflow-create-${keySuffix}` },
    data: { title },
  });
  expect(createdResponse.ok()).toBe(true);
  const created = await createdResponse.json();
  const savedResponse = await page.request.put(`/api/decisions/${encodeURIComponent(created.id)}`, {
    headers: { Origin: origin, "If-Match": created.etag },
    data: {
      title,
      decisionDate: "2026-11-01",
      context: "This accepted fixture proves the read-only layout independently.",
      constraints: [],
      options: [],
      decision: "Keep the evidence local to this browser project.",
      assumptions: [],
    },
  });
  expect(savedResponse.ok()).toBe(true);
  const saved = await savedResponse.json();
  const acceptedResponse = await page.request.post(`/api/decisions/${encodeURIComponent(created.id)}/accept`, {
    headers: {
      Origin: origin,
      "If-Match": saved.etag,
      "Idempotency-Key": `e2e-reflow-accept-${keySuffix}`,
    },
    data: {},
  });
  expect(acceptedResponse.ok()).toBe(true);
  return created.id;
}

test("Today is responsive and has no detectable accessibility violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Today", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Journey", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Decisions", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Quarter", exact: true })).toBeVisible();
  const currentUser = await page.request.get("/api/me");
  expect(currentUser.ok()).toBe(true);
  expect(await currentUser.json()).toMatchObject({ id: "local-user", name: "Ali" });

  const lightResults = await new AxeBuilder({ page }).analyze();
  expect(lightResults.violations).toEqual([]);

  await page.getByRole("button", { name: "Use dark appearance" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const darkResults = await new AxeBuilder({ page }).analyze();
  expect(darkResults.violations).toEqual([]);
});

test("a decision keeps its original reasoning and appends hindsight", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "This flow deliberately mutates the shared local test store once.");
  await page.goto("/decisions");
  await expect(page.getByRole("heading", { name: "Decisions", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "New decision" }).click();
  await page.getByLabel("Title").fill("Retry ownership at the service boundary");
  await page.getByLabel("Decision date").fill("2026-11-01");
  await page.getByLabel("Context").fill("Retries can amplify a partial failure across services.");
  await page.getByLabel("What we decided").fill("The caller owns retry policy and idempotency.");
  await page.getByLabel("First review date").fill("2026-11-03");
  await page.getByRole("button", { name: "Save draft" }).click();

  await expect(page.getByRole("heading", { name: "Retry ownership at the service boundary" })).toBeVisible();
  const decisionId = decodeURIComponent(new URL(page.url()).pathname.split("/").at(-1)!);
  const current = await page.request.get(`/api/decisions/${encodeURIComponent(decisionId)}`);
  const currentDecision = await current.json();
  const concurrent = await page.request.put(`/api/decisions/${encodeURIComponent(decisionId)}`, {
    headers: { Origin: "http://127.0.0.1:4173", "If-Match": currentDecision.etag },
    data: {
      title: currentDecision.title,
      decisionDate: currentDecision.decisionDate,
      context: "Another local view clarified the failure boundary.",
      constraints: currentDecision.constraints,
      options: currentDecision.options,
      decision: currentDecision.decision,
      consequences: currentDecision.consequences,
      assumptions: currentDecision.assumptions,
      falsifier: currentDecision.falsifier,
      initialReviewDate: currentDecision.initialReviewDate,
    },
  });
  expect(concurrent.ok()).toBe(true);
  await page.getByLabel("Context").fill("Retries can amplify a partial failure across services. Keep this local evidence.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("alert")).toContainText("Refresh it before saving");
  await page.getByRole("button", { name: "Refresh version, keep my text" }).click();
  await expect(page.getByLabel("Context")).toHaveValue("Retries can amplify a partial failure across services. Keep this local evidence.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByRole("button", { name: "Accept decision" }).click();
  await expect(page.getByText("Read-only history")).toBeVisible();
  await expect(page.getByText("The caller owns retry policy and idempotency.")).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "1 decision is ready to revisit" })).toBeVisible();
  await page.getByRole("link", { name: "See due decisions" }).click();
  await page.getByRole("link", { name: "Retry ownership at the service boundary" }).first().click();
  await page.getByRole("radio", { name: "I would adjust it" }).check();
  await page.getByLabel("What changed or still holds?").fill("The retry budget also belongs at the caller boundary.");
  await page.getByLabel("Next review date (optional)").fill("2026-12-01");
  await page.getByRole("button", { name: "Add review" }).click();
  await expect(page.getByText("The retry budget also belongs at the caller boundary.")).toBeVisible();

  await page.getByRole("radio", { name: "Postpone review" }).check();
  await page.getByLabel("Review later").fill("2026-12-15");
  await page.getByRole("button", { name: "Postpone review" }).click();
  await expect(page.getByText("Review postponed")).toBeVisible();

  await page.getByRole("radio", { name: "Replace it" }).check();
  await page.getByLabel("What changed or still holds?").fill("A new boundary now owns the retry policy.");
  await page.getByRole("button", { name: "Add review" }).click();
  await expect(page.getByText("This decision was superseded.")).toBeVisible();

  await page.goto("/journey");
  await expect(page.getByText("The retry budget also belongs at the caller boundary.")).toBeVisible();
  await expect(page.getByRole("link", { name: "View decision" }).first()).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.goto("/tasks/2026-10-07-adr-1-live-stack-decision");
  await page.getByRole("button", { name: "Start decision draft" }).click();
  await expect(page.getByRole("heading", { name: "Live decision from the current stack" })).toBeVisible();
  await expect(page.getByText("draft", { exact: true })).toBeVisible();
});

test("Decisions navigation and editor reflow without accessibility violations", async ({ page }, testInfo) => {
  const acceptedTitle = `Responsive accepted decision · ${testInfo.project.name}`;
  await createAcceptedDecision(page, acceptedTitle, testInfo.project.name);
  await page.goto("/decisions");
  await expect(page.getByRole("heading", { name: "Decisions", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "New decision" }).click();
  await expect(page.getByRole("heading", { name: "Capture a decision" })).toBeVisible();
  await expect(page.getByLabel("Context")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.goto("/decisions");
  await page.getByRole("link", { name: acceptedTitle }).first().click();
  await expect(page.getByText("Read-only history")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("the daily loop survives browser refresh and supports Undo", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The daily loop mutates the shared local test store once.");
  await page.goto("/");
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();

  await page.getByRole("link", { name: "Journey", exact: true }).click();
  const sessionStrip = page.getByRole("complementary", { name: "Current session" });
  await expect(sessionStrip.getByText(/Running ·/)).toBeVisible();
  await expect(sessionStrip.getByRole("button", { name: "Pause" })).toBeVisible();
  await sessionStrip.getByRole("link", { name: "Return to Today" }).click();

  await page.reload();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();

  await page.getByRole("button", { name: "Finish item" }).click();
  const dialog = page.getByRole("dialog", { name: "How did it land?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("radio", { name: "Made progress" }).check();
  await dialog.getByLabel("One thing worth remembering?").fill("The failure boundary needs an idempotent retry.");
  await dialog.getByRole("button", { name: "Finish item" }).click();
  await expect(page.getByText("Finished.")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
});

test("Quick Thought returns to Journey and both themes remain accessible", async ({ page }, testInfo) => {
  await page.goto("/");
  const start = page.getByRole("button", { name: "Start session" });
  if (await start.isVisible().catch(() => false)) {
    await start.click();
    await page.getByRole("button", { name: "Pause" }).click();
  } else {
    const pause = page.getByRole("button", { name: "Pause" });
    if (await pause.isVisible().catch(() => false)) await pause.click();
  }
  await page.goto("/journey");
  await expect(page.getByRole("heading", { name: "Journey", exact: true })).toBeVisible();
  const activityCalendar = page.getByRole("list", { name: "365 days of recorded session activity" });
  await expect(activityCalendar.getByRole("listitem")).toHaveCount(365);
  if (testInfo.project.name === "mobile-360") {
    const activityScroller = page.getByRole("region", { name: "Scrollable learning activity calendar" });
    await expect.poll(() => activityScroller.evaluate((element) => element.scrollLeft > 0)).toBe(true);
  }
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const thought = `Retry ownership belongs at one boundary · ${testInfo.project.name}`;
  await page.getByRole("button", { name: "+ Thought" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Add a thought" });
  await expect(dialog.getByRole("textbox", { name: "What is worth keeping?" })).toBeFocused();
  await dialog.getByRole("textbox", { name: "What is worth keeping?" }).fill(thought);
  await dialog.getByRole("button", { name: "Save thought" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(thought)).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const lightResults = await new AxeBuilder({ page }).analyze();
  expect(lightResults.violations).toEqual([]);
  await page.getByRole("button", { name: "Use dark appearance" }).click();
  const darkResults = await new AxeBuilder({ page }).analyze();
  expect(darkResults.violations).toEqual([]);
});

test("task history supports correction, carry forward, and milestone review", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "This flow deliberately mutates the shared local test store once.");
  await page.goto("/tasks/2026-11-03-partial-failure");
  await expect(page.getByRole("heading", { name: "Partial failure" })).toBeVisible();

  await page.getByRole("button", { name: "Correct time" }).first().click();
  const correction = page.getByRole("dialog", { name: "Correct session time" });
  await expect(correction.getByLabel("Started (UTC)")).toBeFocused();
  await correction.getByRole("button", { name: "Save correction" }).click();
  await expect(correction).toBeHidden();
  await expect(page.getByText(/corrected/)).toBeVisible();

  await page.getByRole("button", { name: "Carry remaining work forward" }).click();
  await page.getByLabel("Continuation date").fill("2026-11-04");
  await page.getByLabel("What remains? Optional").fill("Validate the remaining failure path.");
  await page.getByRole("button", { name: "Create continuation" }).click();
  await expect(page.getByRole("heading", { name: "Partial failure" })).toBeVisible();
  await expect(page.getByText("No session time recorded yet.")).toBeVisible();

  await page.goto("/quarters/q4-2026/milestones/q4-2026-w05/summary");
  await expect(page.getByRole("heading", { name: "Week 5" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "During this period" })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("Quarter overview navigates to Focus Areas and Milestones accessibly at desktop and 360px", async ({ page }) => {
  await page.goto("/quarter");
  await expect(page.getByRole("heading", { name: /Engineering Growth/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What would make this Quarter worthwhile" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Systems Reliability", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Systems Reliability", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Systems Reliability", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Partial failure" }).first()).toBeVisible();
  await page.getByRole("link", { name: /Back to Quarter/ }).click();
  await page.getByRole("link", { name: "Week 5", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Week 5", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "View what happened during this milestone" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole("button", { name: "Use dark appearance" }).click();
  const darkResults = await new AxeBuilder({ page }).analyze();
  expect(darkResults.violations).toEqual([]);
  await page.getByRole("button", { name: "Use light appearance" }).click();
  const lightResults = await new AxeBuilder({ page }).analyze();
  expect(lightResults.violations).toEqual([]);
});

test("plan preview, explicit removal acknowledgement, YAML export and unchanged reimport work", async ({ page }, testInfo) => {
  await page.goto("/quarter");
  await expect(page.getByRole("heading", { name: /Engineering Growth/ })).toBeVisible();
  await page.getByRole("button", { name: "Update plan" }).click();
  const removedTaskId = testInfo.project.name === "desktop" ? "2026-10-05-go-foundations" : "2026-10-06-timeouts";
  await page.locator('input[type="file"]').setInputFiles({
    name: "q4-plan-update.yaml", mimeType: "application/yaml", buffer: Buffer.from(q4PlanWithout(removedTaskId)),
  });
  await page.getByRole("button", { name: "Validate and preview" }).click();
  await expect(page.getByRole("heading", { name: "Review before applying" })).toBeVisible();
  await expect(page.getByText("History preserved", { exact: true })).toBeVisible();
  const requestedRemovalLabel = testInfo.project.name === "desktop" ? "Confirm removing Go foundations" : "Confirm removing Timeouts";
  await expect(page.getByRole("checkbox", { name: new RegExp(requestedRemovalLabel) })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  const checkboxes = await page.getByRole("checkbox").all();
  const firstCheckbox = page.getByRole("checkbox").first();
  await firstCheckbox.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(firstCheckbox).toBeFocused();
  expect(await firstCheckbox.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
  await page.keyboard.press("Space");
  await expect(firstCheckbox).toBeChecked();
  for (const checkbox of checkboxes.slice(1)) await checkbox.check();

  const lightResults = await new AxeBuilder({ page }).analyze();
  expect(lightResults.violations).toEqual([]);
  await page.getByRole("button", { name: "Use dark appearance" }).click();
  const darkResults = await new AxeBuilder({ page }).analyze();
  expect(darkResults.violations).toEqual([]);

  if (testInfo.project.name !== "desktop") return;
  await page.getByRole("button", { name: "Apply plan" }).click();
  await expect(page.getByRole("heading", { name: /Engineering Growth/ })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export YAML" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("q4-2026-plan.yaml");

  const exported = await page.request.get("/api/plans/export/q4-2026");
  expect(exported.ok()).toBe(true);
  const roundTrip = await page.request.post("/api/plans/preview", {
    headers: { Origin: "http://127.0.0.1:4173", "Content-Type": "application/json" },
    data: { sourceFormat: "yaml", content: await exported.text() },
  });
  expect(roundTrip.ok()).toBe(true);
  expect(await roundTrip.json()).toMatchObject({ summary: { added: 0, changed: 0, removed: 0, historicalPreserved: 0, conflicts: 0 }, changes: [] });
});
