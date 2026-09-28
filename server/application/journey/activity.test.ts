// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createProductionSeed } from "../../domain/production-seed.js";
import { projectActivity } from "./activity.js";

describe("Activity projection", () => {
  it("recalculates both local dates when a corrected closed interval crosses midnight", () => {
    const state = createProductionSeed("2026-09-27T10:00:00.000Z");
    state.records.sessions.corrected = {
      id: "corrected",
      taskId: "2026-11-03-partial-failure",
      startedAt: "2026-11-03T22:50:00.000Z",
      endedAt: "2026-11-04T00:20:00.000Z",
      timeZoneAtStart: "Europe/Amsterdam",
      createdAt: "2026-11-03T22:50:00.000Z",
      updatedAt: "2026-11-04T08:00:00.000Z",
      correctedAt: "2026-11-04T08:00:00.000Z",
    };
    expect(projectActivity(state, "local-user", "2026-11-03", "2026-11-04").days).toEqual([
      { date: "2026-11-03", sessionSeconds: 600, level: 1 },
      { date: "2026-11-04", sessionSeconds: 4_800, level: 4 },
    ]);
  });
});
