// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAndNormalizePlanYaml, PlanValidationError } from "./plan.js";
import { createProductionSeed } from "./production-seed.js";
import { validateJourneyState } from "./journey-state.js";

const fixture = readFileSync(
  resolve(process.cwd(), "planning/fixtures/q4-2026-engineering-growth.yaml"),
  "utf8",
);
const instant = "2026-09-27T10:00:00.000Z";

function minimalPlan(taskFields = ""): string {
  return `version: 1
quarter:
  id: q-test
  title: Test quarter
  start: 2026-10-01
  end: 2026-10-31
focusAreas: []
milestones:
  - id: m-test
    title: Test milestone
    start: 2026-10-01
    end: 2026-10-31
    mode: STANDARD
tasks:
  - id: task-test
    milestoneId: m-test
    date: 2026-10-01
    title: Test task
${taskFields}`;
}

describe("plan YAML", () => {
  it("parses the complete fixture and applies only documented defaults", () => {
    const plan = parseAndNormalizePlanYaml(fixture);

    expect(plan.quarter.successCriteria).toHaveLength(9);
    expect(plan.focusAreas).toHaveLength(4);
    expect(plan.milestones).toHaveLength(13);
    expect(plan.tasks).toHaveLength(64);
    expect(plan.tasks[0]).toMatchObject({
      id: "2026-10-05-go-foundations",
      tags: [],
      recommendationMode: "DEFAULT",
    });
    expect(plan.tasks.find((task) => task.id === "2026-10-09-durable-execution"))
      .toMatchObject({ recommendationMode: "WHEN_CLEAR" });
  });

  it("rejects unknown fields at nested object levels", () => {
    expect(() => parseAndNormalizePlanYaml(minimalPlan("    status: FINISHED\n")))
      .toThrow(PlanValidationError);
    expect(() => parseAndNormalizePlanYaml(minimalPlan().replace("    mode: STANDARD", "    mode: STANDARD\n    surprise: true")))
      .toThrow(PlanValidationError);
  });

  it("rejects invalid references, invalid dates, duplicate keys, and aliases", () => {
    expect(() => parseAndNormalizePlanYaml(minimalPlan().replace("milestoneId: m-test", "milestoneId: missing")))
      .toThrow(/referenced milestone does not exist/);
    expect(() => parseAndNormalizePlanYaml(minimalPlan().replace("2026-10-31", "2026-10-99")))
      .toThrow(/valid calendar date/);
    expect(() => parseAndNormalizePlanYaml(minimalPlan().replace("  title: Test quarter", "  title: Test quarter\n  title: Duplicate")))
      .toThrow(PlanValidationError);
    expect(() => parseAndNormalizePlanYaml(minimalPlan().replace("title: Test task", "title: &task-title Test task\n    description: *task-title")))
      .toThrow(PlanValidationError);
  });

  it("accepts an explicitly empty Quarter without inventing a Milestone", () => {
    const empty = `version: 1
quarter:
  id: empty-quarter
  title: A quiet quarter
  start: 2026-10-01
  end: 2026-12-31
focusAreas: []
milestones: []
tasks: []
`;
    expect(parseAndNormalizePlanYaml(empty)).toMatchObject({ quarter: { id: "empty-quarter" }, milestones: [], tasks: [] });
    expect(() => parseAndNormalizePlanYaml(empty.replace("tasks: []", "tasks:\n  - id: needs-period\n    milestoneId: missing\n    date: 2026-10-01\n    title: Missing milestone"))).toThrow(/requires at least one Milestone/);
  });

  it("enforces the UTF-8 YAML source byte limit", () => {
    expect(() => parseAndNormalizePlanYaml("x".repeat(1024 * 1024 + 1)))
      .toThrow(/YAML source exceeds 1048576 bytes/);
  });
});

describe("production seed", () => {
  it("creates the canonical validated no-history Q4 state", () => {
    const state = createProductionSeed(instant);

    expect(validateJourneyState(state)).toEqual([]);
    expect(state.storeRevision).toBe(0);
    expect(state.records.users["local-user"]).toMatchObject({
      name: "Ali",
      timeZone: "Europe/Amsterdam",
      createdAt: instant,
    });
    expect(state.records.quarters["q4-2026"]).toMatchObject({
      planRevision: 1,
      startDate: "2026-10-01",
      endDate: "2026-12-31",
    });
    expect(Object.keys(state.records.focusAreas)).toHaveLength(4);
    expect(Object.keys(state.records.milestones)).toHaveLength(13);
    expect(Object.keys(state.records.tasks)).toHaveLength(64);
    expect(Object.values(state.records.tasks).every((task) => task.status === "NOT_STARTED"))
      .toBe(true);
    expect(state.records.tasks["2026-10-05-go-foundations"]).toMatchObject({
      position: 0,
      tags: [],
      recommendationMode: "DEFAULT",
    });
    expect(state.records.sessions).toEqual({});
    expect(state.records.taskLifecycleEvents).toEqual({});
    expect(state.records.dailyReviews).toEqual({});
    expect(state.commandReceipts).toEqual({});
  });
});
