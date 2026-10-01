import { defineConfig, devices } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const browserRunRoot = process.env.WAYPOINT_E2E_RUN_ROOT ?? mkdtempSync(join(tmpdir(), "waypoint-browser-run-"));
process.env.WAYPOINT_E2E_RUN_ROOT = browserRunRoot;
const browserStore = join(browserRunRoot, "store");
const browserAuth = join(browserRunRoot, "bootstrap.txt");
const browserStorageState = join(browserRunRoot, "owner.json");
const browserTotpSecret = join(browserRunRoot, "owner-totp.txt");
process.env.WAYPOINT_E2E_BOOTSTRAP_FILE = browserAuth;
process.env.WAYPOINT_E2E_STORAGE_STATE = browserStorageState;
process.env.WAYPOINT_E2E_TOTP_FILE = browserTotpSecret;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run auth:bootstrap -- --email owner@example.test > ${browserAuth} && npm run build && npm run start`,
    env: {
      JOURNEY_STORE_DIR: browserStore,
      JOURNEY_ENV: "test",
      JOURNEY_FIXED_NOW: "2026-11-03T17:00:00.000Z",
      WAYPOINT_E2E_BOOTSTRAP_FILE: browserAuth,
      WAYPOINT_E2E_STORAGE_STATE: browserStorageState,
      WAYPOINT_E2E_TOTP_FILE: browserTotpSecret,
    },
    url: "http://127.0.0.1:4173/api/auth/session",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: "auth-setup", testMatch: /auth\.setup\.ts/, use: { baseURL: "http://127.0.0.1:4173" } },
    { name: "desktop", dependencies: ["auth-setup"], use: { ...devices["Desktop Chrome"], storageState: browserStorageState } },
    {
      name: "mobile-360",
      dependencies: ["auth-setup"],
      use: { storageState: browserStorageState,
        viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true },
    },
  ],
});
