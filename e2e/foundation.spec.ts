import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("Today is responsive and has no detectable accessibility violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Today", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Journey", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Quarter", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Decisions", exact: true })).toHaveCount(0);
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
