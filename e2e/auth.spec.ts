import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { totpCodeAt } from "../server/auth/totp.js";

test("an owner can invite a private member and member access stays scoped", async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "This flow creates one invited member in the shared test store.");

  await page.goto("/access");
  await expect(page.getByRole("heading", { name: "Access" })).toBeVisible();
  const memberEmail = "invited-member@example.test";
  await page.getByLabel("Member email").fill(memberEmail);
  await page.getByRole("button", { name: "Create invite" }).click();
  const inviteId = await page.locator("code").innerText();
  expect(inviteId).toMatch(/^wp_inv_/);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  const memberContext = await browser.newContext({
    baseURL: "http://127.0.0.1:4173",
    storageState: { cookies: [], origins: [] },
  });
  const memberPage = await memberContext.newPage();
  await memberPage.goto("/register");
  await memberPage.getByLabel("Invite ID").fill(inviteId);
  await memberPage.getByLabel("Email").fill(memberEmail);
  await memberPage.getByLabel("Display name").fill("Invited Member");
  await memberPage.getByLabel("Password", { exact: true }).fill("invited-member-passphrase");
  await memberPage.getByLabel("Confirm password").fill("invited-member-passphrase");
  await memberPage.getByRole("button", { name: "Create account" }).click();
  await expect(memberPage.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
  await expect(memberPage.getByRole("link", { name: "Access", exact: true })).toHaveCount(0);
  await memberPage.goto("/access");
  await expect(memberPage).toHaveURL(/\/$/);
  await memberPage.getByRole("button", { name: /Invited Member/ }).click();
  await expect(memberPage.getByText("Member", { exact: true })).toBeVisible();
  await memberContext.close();
});

test("sign out removes private screens and sign in restores them", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One desktop pass covers the cookie lifecycle.");

  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4173",
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("owner@example.test");
  await page.getByLabel("Password").fill("browser-owner-passphrase");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByLabel("Authenticator code")).toBeVisible();
  const ownerTotpFile = process.env.WAYPOINT_E2E_TOTP_FILE;
  if (!ownerTotpFile) throw new Error("The browser owner TOTP path is missing.");
  const ownerTotpSecret = readFileSync(ownerTotpFile, "utf8").trim();
  await page.getByLabel("Authenticator code").fill(totpCodeAt(ownerTotpSecret, new Date("2026-11-03T17:00:30.000Z")));
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Browser Owner/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.goto("/journey");
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { name: "Journey", exact: true })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await context.close();
});
