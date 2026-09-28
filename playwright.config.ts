import { defineConfig, devices } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const browserStore = join(mkdtempSync(join(tmpdir(), "journey-browser-root-")), "store");

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
    command: "npm run build && npm run start",
    env: {
      JOURNEY_STORE_DIR: browserStore,
      JOURNEY_ENV: "test",
      JOURNEY_FIXED_NOW: "2026-11-03T17:00:00.000Z",
    },
    url: "http://127.0.0.1:4173/api/me",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile-360",
      use: { viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true },
    },
  ],
});
