// README screenshots: seeds lively demo data via the API, then captures
// Today / Journey / Quarter into docs/screenshots/. Desktop project only.
// Run: npx playwright test screenshots --project=desktop
import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = "http://127.0.0.1:4173";
const SHOT_DIR = resolve(process.cwd(), "docs/screenshots");

test("capture README screenshots with lively demo data", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "README screenshots run on desktop only.");
  test.skip(!process.env.WAYPOINT_SCREENSHOTS, "Set WAYPOINT_SCREENSHOTS=1 to capture README screenshots.");
  mkdirSync(SHOT_DIR, { recursive: true });

  // 1. Start the first offered task so Today shows a live session hero.
  const dashboardResponse = await page.request.get("/api/dashboard", { headers: { Accept: "application/json" } });
  expect(dashboardResponse.ok()).toBe(true);
  const dashboard = await dashboardResponse.json();
  const task = dashboard.upNext?.task ?? dashboard.hero?.task;
  expect(task?.id, "seeded plan should offer a task").toBeTruthy();
  if (task.status === "NOT_STARTED") {
    const start = await page.request.post(`/api/tasks/${encodeURIComponent(task.id)}/start`, {
      headers: { Origin: ORIGIN, "If-Match": task.etag, "Idempotency-Key": "readme-shots-start" },
      data: {},
    });
    expect(start.ok(), await start.text()).toBe(true);
  }

  // 2. Two thoughts so Journey has a stream (one linked to the live task).
  for (const [index, body] of [
    { text: "Session notes live here: what I tried, what surprised me, what to revisit.", relatedTaskId: task.id },
    { text: "Friday is a WHEN_CLEAR day — catch-up first, exploration only if the week is genuinely clear." },
  ].entries()) {
    const thought = await page.request.post("/api/journey", {
      headers: { Origin: ORIGIN, "Idempotency-Key": `readme-shots-thought-${index}` },
      data: { text: body.text, tags: [], changedMyMind: false, ...(body.relatedTaskId ? { relatedTaskId: body.relatedTaskId } : {}) },
    });
    expect(thought.ok(), await thought.text()).toBe(true);
  }

  // 3. Capture.
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [route, file] of [["/", "today.png"], ["/journey", "journey.png"], ["/quarter", "quarter.png"]] as const) {
    await page.goto(route, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    // Drop the skip-link focus ring so shots look like a real visit.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
    await page.waitForTimeout(150);
    await page.screenshot({ path: resolve(SHOT_DIR, file) });
  }
});
