// @vitest-environment node
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteJourneyStore } from "../../adapters/sqlite-store/index.js";
import { LocalCurrentUserProvider } from "../../adapters/local-current-user-provider.js";
import { createNoHistorySeed } from "../../domain/journey-state.js";
import { createProductionSeed } from "../../domain/production-seed.js";
import { captureTaskPlanContext } from "../history/capture-plan-context.js";
import { FixedClock } from "../../ports/clock.js";
import { SequenceIdGenerator } from "../../ports/id-generator.js";
import { parse, stringify } from "yaml";
import { PlanCommandService, exportQuarterPlanYaml } from "./plan-command-service.js";

const roots: string[] = [];
const now = new Date("2026-11-03T17:00:00.000Z");
const fixture = readFileSync(resolve(process.cwd(), "planning/fixtures/example-quarter.yaml"), "utf8");
const targetTask = "2026-11-03-partial-failure";

function planWithoutTask(taskId: string): string {
  const plan = parse(fixture) as { tasks: Array<{ id: string }> };
  plan.tasks = plan.tasks.filter((task) => task.id !== taskId);
  return stringify(plan, { lineWidth: 0 });
}

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function context(seed: (writtenAt: string) => ReturnType<typeof createNoHistorySeed> = createNoHistorySeed) {
  const root = await mkdtemp(join(tmpdir(), "journey-plan-service-")); roots.push(root);
  const storeIds = new SequenceIdGenerator(["init", "store", ...Array.from({ length: 30 }, (_, index) => `store-commit-${index}`)]);
  const clock = new FixedClock(now);
  const store = new SqliteJourneyStore({ directory: join(root, "store"), clock, idGenerator: storeIds, seed });
  await store.initialize();
  const ids = new SequenceIdGenerator(Array.from({ length: 30 }, (_, index) => `preview-token-${index}`));
  return { store, service: new PlanCommandService(store, new LocalCurrentUserProvider(store), clock, ids) };
}

describe("Slice 4 plan lifecycle", () => {
  it("keeps preview read-only and normalized export/reimport has an empty semantic diff", async () => {
    const { store, service } = await context(createProductionSeed);
    const before = await store.read((state) => ({ revision: state.storeRevision, quarter: structuredClone(state.records.quarters["q4-2026"]) }));
    const preview = await service.preview(fixture);
    expect(preview).toMatchObject({ mode: "UPDATE_QUARTER", basePlanRevision: 1, summary: { added: 0, changed: 0, removed: 0, historicalPreserved: 0, conflicts: 0 }, changes: [], requiredAcknowledgements: [] });
    const afterPreview = await store.read((state) => ({ revision: state.storeRevision, quarter: state.records.quarters["q4-2026"] }));
    expect(afterPreview).toEqual(before);

    const exported = await service.export("q4-2026");
    const roundTrip = await service.preview(exported.content);
    expect(roundTrip.summary).toEqual({ added: 0, changed: 0, removed: 0, historicalPreserved: 0, conflicts: 0 });
    expect(roundTrip.changes).toEqual([]);
    expect(exportQuarterPlanYaml(await store.read((state) => state), (await store.read((state) => state.records.quarters["q4-2026"]!))).includes("sessions:")).toBe(false);
  });

  it("creates a Quarter in an explicitly empty store without inventing execution history, and replays the command", async () => {
    const { store, service } = await context();
    const preview = await service.preview(fixture);
    expect(preview.mode).toBe("CREATE_QUARTER");
    expect(preview.basePlanRevision).toBeNull();
    const applied = await service.apply({ previewToken: preview.previewToken, acknowledgementIds: [] }, "plan-create-key-0001", { ifNoneMatch: "*" });
    expect(applied).toMatchObject({ mode: "CREATE_QUARTER", quarterId: "q4-2026", planRevision: 1, changed: true, replayed: false });
    const replay = await service.apply({ previewToken: preview.previewToken, acknowledgementIds: [] }, "plan-create-key-0001", { ifNoneMatch: "*" });
    expect(replay).toMatchObject({ mode: "CREATE_QUARTER", planRevision: 1, changed: false, replayed: true });
    const state = await store.read((value) => value);
    expect(state.storeRevision).toBe(1);
    expect(Object.keys(state.records.tasks)).toHaveLength(8);
    expect(Object.values(state.records.tasks).every((task) => task.status === "NOT_STARTED" && !task.planSnapshot)).toBe(true);
    expect(Object.values(state.records.milestones).every((item) => !item.intentSnapshot)).toBe(true);
    expect(state.records.quarters["q4-2026"]?.intentSnapshot).toBeUndefined();
    expect(state.records.sessions).toEqual({});
    expect(state.records.taskLifecycleEvents).toEqual({});
    expect(state.records.dailyReviews).toEqual({});
    expect(state.records.journeyEntries).toEqual({});
    expect(state.records.decisionRecords).toEqual({});
    expect(state.records.aiReviews).toEqual({});
  });

  it("requires acknowledgement for an active Task edit and keeps its session and snapshot", async () => {
    const { store, service } = await context(createProductionSeed);
    await store.transact({ kind: "STANDARD" }, (draft) => {
      const task = draft.records.tasks[targetTask]!;
      captureTaskPlanContext(draft, task, "Europe/Amsterdam", now.toISOString());
      task.status = "IN_PROGRESS";
      draft.records.sessions["active-session"] = {
        id: "active-session", taskId: targetTask, startedAt: now.toISOString(), timeZoneAtStart: "Europe/Amsterdam",
        createdAt: now.toISOString(), updatedAt: now.toISOString(),
      };
      return { kind: "changed", value: undefined };
    });
    const changed = fixture.replace("title: Partial failure", "title: Partial failure — revised intent");
    const preview = await service.preview(changed);
    const taskChange = preview.changes.find((item) => item.id === targetTask);
    expect(taskChange).toMatchObject({ kind: "CONFLICT", operation: "UPDATE", historyPreserved: true });
    const ack = preview.requiredAcknowledgements.find((item) => item.id === `preserve-active:${targetTask}`)!;
    const before = await store.read((state) => ({ revision: state.storeRevision, session: structuredClone(state.records.sessions["active-session"]), snapshot: structuredClone(state.records.tasks[targetTask]?.planSnapshot) }));
    await expect(service.apply({ previewToken: preview.previewToken, acknowledgementIds: [] }, "plan-active-key-0001", { ifMatch: preview.baseEtag! })).rejects.toMatchObject({ code: "ACKNOWLEDGEMENT_REQUIRED" });
    expect(await store.read((state) => state.storeRevision)).toBe(before.revision);

    await service.apply({ previewToken: preview.previewToken, acknowledgementIds: [ack.id] }, "plan-active-key-0001", { ifMatch: preview.baseEtag! });
    const after = await store.read((state) => ({ task: state.records.tasks[targetTask], session: state.records.sessions["active-session"], snapshot: state.records.tasks[targetTask]?.planSnapshot }));
    expect(after.task).toMatchObject({ status: "IN_PROGRESS", title: "Partial failure — revised intent" });
    expect(after.session).toEqual(before.session);
    expect(after.snapshot).toEqual(before.snapshot);
    expect(after.snapshot?.title).toBe("Partial failure");
  });

  it("deletes only a pristine removed Task, and tombstones active removed work without changing its history", async () => {
    const pristine = await context(createProductionSeed);
    const removalPreview = await pristine.service.preview(planWithoutTask(targetTask));
    expect(removalPreview.changes.find((item) => item.id === targetTask)).toMatchObject({ operation: "REMOVE", kind: "REMOVED", historyPreserved: false });
    const removalAck = removalPreview.requiredAcknowledgements.find((item) => item.id === `confirm-removal:task:${targetTask}`)!;
    await pristine.service.apply({ previewToken: removalPreview.previewToken, acknowledgementIds: [removalAck.id] }, "plan-remove-pristine-0001", { ifMatch: removalPreview.baseEtag! });
    const pristineAfter = await pristine.store.read((state) => state);
    expect(pristineAfter.records.tasks[targetTask]).toBeUndefined();
    expect(Object.values(pristineAfter.records.taskLifecycleEvents)).toEqual([]);
    expect(Object.values(pristineAfter.records.sessions)).toEqual([]);

    const active = await context(createProductionSeed);
    await active.store.transact({ kind: "STANDARD" }, (draft) => {
      const task = draft.records.tasks[targetTask]!;
      captureTaskPlanContext(draft, task, "Europe/Amsterdam", now.toISOString());
      task.status = "IN_PROGRESS";
      draft.records.sessions["active-session"] = {
        id: "active-session", taskId: targetTask, startedAt: now.toISOString(), timeZoneAtStart: "Europe/Amsterdam",
        createdAt: now.toISOString(), updatedAt: now.toISOString(),
      };
      return { kind: "changed", value: undefined };
    });
    const activePreview = await active.service.preview(planWithoutTask(targetTask));
    expect(activePreview.changes.find((item) => item.id === targetTask)).toMatchObject({ operation: "REMOVE", kind: "CONFLICT", historyPreserved: true });
    const required = activePreview.requiredAcknowledgements.map((item) => item.id);
    expect(required).toContain(`confirm-removal:task:${targetTask}`);
    expect(required).toContain(`preserve-active:${targetTask}`);
    const before = await active.store.read((state) => ({ session: state.records.sessions["active-session"], snapshot: state.records.tasks[targetTask]?.planSnapshot }));
    await active.service.apply({ previewToken: activePreview.previewToken, acknowledgementIds: required }, "plan-remove-active-0001", { ifMatch: activePreview.baseEtag! });
    const after = await active.store.read((state) => ({ task: state.records.tasks[targetTask], session: state.records.sessions["active-session"], snapshot: state.records.tasks[targetTask]?.planSnapshot }));
    expect(after.task).toMatchObject({ status: "IN_PROGRESS", removedFromPlanAt: now.toISOString() });
    expect(after.session).toEqual(before.session);
    expect(after.snapshot).toEqual(before.snapshot);

    const readdPreview = await active.service.preview(fixture);
    expect(readdPreview.changes.find((item) => item.id === targetTask)).toMatchObject({ operation: "UPDATE", historyPreserved: true });
    const readdAcks = readdPreview.requiredAcknowledgements.map((item) => item.id);
    await active.service.apply({ previewToken: readdPreview.previewToken, acknowledgementIds: readdAcks }, "plan-readd-active-0001", { ifMatch: readdPreview.baseEtag! });
    const readded = await active.store.read((state) => state.records.tasks[targetTask]);
    expect(readded).toMatchObject({ status: "IN_PROGRESS", title: "Partial failure" });
    expect(readded?.removedFromPlanAt).toBeUndefined();
  });

  it("requires confirmation when success criteria leave the Quarter plan", async () => {
    const { service } = await context(createProductionSeed);
    const plan = parse(fixture) as { quarter: { successCriteria: Array<{ id: string }> } } & Record<string, unknown>;
    plan.quarter.successCriteria = plan.quarter.successCriteria.slice(1);
    const preview = await service.preview(stringify(plan));
    expect(preview.summary.changed).toBe(1);
    expect(preview.requiredAcknowledgements).toContainEqual(expect.objectContaining({ id: "confirm-removal:criterion:q4-2026-criterion-1", code: "CONFIRM_PLAN_REMOVAL" }));
  });

  it("previews and confirms removal of a wholly pristine plan without calling it preserved history", async () => {
    const { store, service } = await context(createProductionSeed);
    const plan = parse(fixture) as { focusAreas: unknown[]; milestones: unknown[]; tasks: unknown[] };
    plan.focusAreas = [];
    plan.milestones = [];
    plan.tasks = [];
    const preview = await service.preview(stringify(plan));
    expect(preview.summary).toMatchObject({ added: 0, changed: 0, removed: 16, historicalPreserved: 0, conflicts: 0 });
    expect(preview.requiredAcknowledgements).toHaveLength(16);
    expect(preview.changes.filter((change) => change.operation === "REMOVE" && change.historyPreserved)).toEqual([]);
    await service.apply({ previewToken: preview.previewToken, acknowledgementIds: preview.requiredAcknowledgements.map((item) => item.id) }, "plan-empty-quarter-0001", { ifMatch: preview.baseEtag! });
    const after = await store.read((state) => state);
    expect(after.records.tasks).toEqual({});
    expect(after.records.milestones).toEqual({});
    expect(after.records.focusAreas).toEqual({});
    expect(after.records.taskLifecycleEvents).toEqual({});
  });

  it("invalidates a removal preview if its pristine Task starts before Apply", async () => {
    const { store, service } = await context(createProductionSeed);
    const preview = await service.preview(planWithoutTask(targetTask));
    const removalAck = preview.requiredAcknowledgements.find((item) => item.id === `confirm-removal:task:${targetTask}`)!;
    await store.transact({ kind: "STANDARD" }, (draft) => {
      const task = draft.records.tasks[targetTask]!;
      captureTaskPlanContext(draft, task, "Europe/Amsterdam", now.toISOString());
      task.status = "IN_PROGRESS";
      draft.records.sessions["started-after-preview"] = {
        id: "started-after-preview", taskId: targetTask, startedAt: now.toISOString(), timeZoneAtStart: "Europe/Amsterdam",
        createdAt: now.toISOString(), updatedAt: now.toISOString(),
      };
      return { kind: "changed", value: undefined };
    });
    const revisionBeforeApply = await store.read((state) => state.storeRevision);
    await expect(service.apply({ previewToken: preview.previewToken, acknowledgementIds: [removalAck.id] }, "plan-race-ack-key-0001", { ifMatch: preview.baseEtag! })).rejects.toMatchObject({ code: "STALE_WRITE" });
    const after = await store.read((state) => ({ revision: state.storeRevision, task: state.records.tasks[targetTask], session: state.records.sessions["started-after-preview"] }));
    expect(after.revision).toBe(revisionBeforeApply);
    expect(after.task).toMatchObject({ status: "IN_PROGRESS" });
    expect(after.task?.removedFromPlanAt).toBeUndefined();
    expect(after.session).toBeDefined();
  });

  it("serializes concurrent applies so only one plan revision is committed", async () => {
    const { service, store } = await context(createProductionSeed);
    const [first, second] = await Promise.all([
      service.preview(fixture.replace("title: Partial failure", "title: Concurrent first")),
      service.preview(fixture.replace("title: Partial failure", "title: Concurrent second")),
    ]);
    const results = await Promise.allSettled([
      service.apply({ previewToken: first.previewToken, acknowledgementIds: [] }, "plan-concurrent-key-0001", { ifMatch: first.baseEtag! }),
      service.apply({ previewToken: second.previewToken, acknowledgementIds: [] }, "plan-concurrent-key-0002", { ifMatch: second.baseEtag! }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "PLAN_REVISION_CHANGED" });
    await expect(store.read((state) => state.records.quarters["q4-2026"]?.planRevision)).resolves.toBe(2);
  });

  it("rejects a stale preview after another plan apply and rejects overlapping Quarter dates", async () => {
    const { service } = await context(createProductionSeed);
    const firstPlan = fixture.replace("title: Partial failure", "title: First intent");
    const secondPlan = fixture.replace("title: Partial failure", "title: Second intent");
    const [first, second] = await Promise.all([service.preview(firstPlan), service.preview(secondPlan)]);
    await service.apply({ previewToken: first.previewToken, acknowledgementIds: [] }, "plan-stale-key-0001", { ifMatch: first.baseEtag! });
    await expect(service.apply({ previewToken: second.previewToken, acknowledgementIds: [] }, "plan-stale-key-0002", { ifMatch: second.baseEtag! })).rejects.toMatchObject({ code: "PLAN_REVISION_CHANGED" });

    const overlap = `version: 1
quarter:
  id: q1-2027
  title: Q1 2027
  start: 2026-12-31
  end: 2027-03-31
focusAreas: []
milestones: []
tasks: []
`;
    await expect(service.preview(overlap)).rejects.toMatchObject({ code: "QUARTER_DATE_OVERLAP" });
  });
});
