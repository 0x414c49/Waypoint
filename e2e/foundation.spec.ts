import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("Today is responsive and has no detectable accessibility violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
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
