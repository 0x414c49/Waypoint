import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("foundation shell is responsive and has no detectable accessibility violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your learning space is ready." })).toBeVisible();
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
