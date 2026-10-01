import { expect, test as setup } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { totpCodeAt } from "../server/auth/totp.js";

const inviteOutput = process.env.WAYPOINT_E2E_BOOTSTRAP_FILE;
const storageState = process.env.WAYPOINT_E2E_STORAGE_STATE;
const totpFile = process.env.WAYPOINT_E2E_TOTP_FILE;
if (!inviteOutput || !storageState || !totpFile) throw new Error("The browser auth setup paths are missing.");

setup("register the owner for browser flows", async ({ page }) => {
  const bootstrapOutput = readFileSync(inviteOutput, "utf8");
  const inviteId = bootstrapOutput.match(/^wp_inv_[A-Za-z0-9_-]+$/m)?.[0];
  if (!inviteId) throw new Error("The browser bootstrap invite was not found.");
  await page.goto("/register");
  await page.getByLabel("Invite ID").fill(inviteId);
  await page.getByLabel("Email").fill("owner@example.test");
  await page.getByLabel("Display name").fill("Browser Owner");
  await page.getByLabel("Password", { exact: true }).fill("browser-owner-passphrase");
  await page.getByLabel("Confirm password").fill("browser-owner-passphrase");
  await page.getByRole("button", { name: "Add authenticator" }).click();
  const totpSecret = (await page.locator("code").innerText()).replace(/\s+/g, "");
  writeFileSync(totpFile, totpSecret, { mode: 0o600 });
  await page.getByLabel("Confirm authenticator code").fill(totpCodeAt(totpSecret, new Date("2026-11-03T17:00:00.000Z")));
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
  await page.context().storageState({ path: storageState });
});
