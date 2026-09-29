// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JsonJourneyStore } from "../../adapters/json-store/index.js";
import { LocalCurrentUserProvider } from "../../adapters/local-current-user-provider.js";
import { StubAIReviewer } from "../../adapters/stub-ai-reviewer.js";
import { createProductionSeed } from "../../domain/production-seed.js";
import type { AIReviewer } from "../../ports/ai-reviewer.js";
import { FixedClock } from "../../ports/clock.js";
import { RandomIdGenerator, SequenceIdGenerator } from "../../ports/id-generator.js";
import { STANDARD_INTENT } from "../../ports/journey-store.js";
import { DecisionCommandService } from "../decisions/decision-command-service.js";
import { taskEtag } from "../task-etag.js";
import { TaskCommandService } from "../tasks/task-command-service.js";
import { AIReviewService } from "./ai-review-service.js";

const now = new Date("2026-11-03T17:00:00.000Z");
const clock = new FixedClock(now);
const roots: string[] = [];

async function makeStore() {
  const root = await mkdtemp(join(tmpdir(), "journey-ai-review-"));
  roots.push(root);
  const store = new JsonJourneyStore({
    directory: join(root, "store"), clock,
    idGenerator: new RandomIdGenerator(),
    seed: createProductionSeed,
  });
  await store.initialize();
  return store;
}

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("AIReviewService", () => {
  it("supports each confirmed target, preserves snapshots, replays one action, and keeps reruns separate", async () => {
    const store = await makeStore();
    const currentUser = new LocalCurrentUserProvider(store);
    const decisionService = new DecisionCommandService(store, currentUser, clock, new SequenceIdGenerator(["ai-decision"]));
    const decision = await decisionService.create({ title: "Keep retries bounded", quarterId: "q4-2026" }, "create-ai-decision-0001");
    const service = new AIReviewService(store, currentUser, clock, new SequenceIdGenerator([
      "ai-task-review-1", "ai-task-review-2", "ai-week-review-1", "ai-quarter-review-1", "ai-decision-review-1",
    ]), new StubAIReviewer());

    const task = await service.create("TASK", "2026-10-05-go-foundations", "review-task-action-0001", "/api/ai/review/task/2026-10-05-go-foundations");
    const replay = await service.create("TASK", "2026-10-05-go-foundations", "review-task-action-0001", "/api/ai/review/task/2026-10-05-go-foundations");
    const rerun = await service.create("TASK", "2026-10-05-go-foundations", "review-task-action-0002", "/api/ai/review/task/2026-10-05-go-foundations");
    await service.create("WEEK", "q4-2026-w01", "review-week-action-0001", "/api/ai/review/week");
    await service.create("QUARTER", "q4-2026", "review-quarter-action-0001", "/api/ai/review/quarter/q4-2026");
    await service.create("DECISION", decision.decision.id, "review-decision-action-0001", `/api/ai/review/decision/${decision.decision.id}`);

    expect(task.review.provider).toBe("stub");
    expect(replay).toMatchObject({ replayed: true, review: { id: task.review.id } });
    expect(rerun).toMatchObject({ replayed: false, review: { id: "ai-task-review-2" } });
    const snapshot = await store.read((state) => ({
      task: state.records.tasks["2026-10-05-go-foundations"],
      quarter: state.records.quarters["q4-2026"],
      records: Object.values(state.records.aiReviews),
    }));
    expect(snapshot.task?.status).toBe("NOT_STARTED");
    expect(snapshot.task?.planSnapshot?.title).toBe("Go foundations");
    expect(snapshot.quarter?.intentSnapshot?.title).toBe("Q4 2026 — Engineering Growth");
    expect(snapshot.records.map((record) => record.targetType).sort()).toEqual(["DECISION", "QUARTER", "TASK", "TASK", "WEEK"]);
    await expect(service.list("WEEK", "q4-2026-w01")).resolves.toMatchObject({ items: [{ targetType: "WEEK", targetId: "q4-2026-w01" }] });
    await expect(service.create("TASK", "2026-10-05-go-foundations", "review-task-action-0001", "/api/ai/review/task/2026-10-05-go-foundations"))
      .resolves.toMatchObject({ replayed: true });
    await expect(service.create("TASK", "2026-10-05-go-foundations", "review-task-action-0001", "/api/ai/review/task/another-task"))
      .rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("does not persist advice or snapshots when the reviewer fails", async () => {
    const store = await makeStore();
    const currentUser = new LocalCurrentUserProvider(store);
    const reviewer: AIReviewer = { review: async () => { throw new Error("provider offline"); } };
    const service = new AIReviewService(store, currentUser, clock, new SequenceIdGenerator(["never-used"]), reviewer);
    const before = await store.read((state) => structuredClone(state.records));

    await expect(service.create("TASK", "2026-10-05-go-foundations", "review-failure-action-0001", "/api/ai/review/task/2026-10-05-go-foundations"))
      .rejects.toMatchObject({ code: "AI_REVIEW_FAILED", status: 503 });
    await expect(store.read((state) => state.records)).resolves.toEqual(before);
  });

  it("caps evidence passed across the AIReviewer seam", async () => {
    const store = await makeStore();
    const currentUser = new LocalCurrentUserProvider(store);
    let receivedEvidence: readonly string[] = [];
    const reviewer: AIReviewer = {
      review: async (request) => {
        receivedEvidence = request.evidence;
        return { provider: "stub-test", strengths: [], gaps: [], questions: [] };
      },
    };
    const service = new AIReviewService(store, currentUser, clock, new SequenceIdGenerator(["bounded-review"]), reviewer);

    await service.create("QUARTER", "q4-2026", "review-bounded-action-0001", "/api/ai/review/quarter/q4-2026");

    expect(receivedEvidence.length).toBeLessThanOrEqual(40);
    expect(receivedEvidence.every((item) => item.length <= 500)).toBe(true);
  });

  it("discards a generated response when its target changes during review", async () => {
    const store = await makeStore();
    const currentUser = new LocalCurrentUserProvider(store);
    const taskId = "2026-10-05-go-foundations";
    const task = await store.read((state) => ({ ...state.records.tasks[taskId]!, etag: taskEtag(state, state.records.tasks[taskId]!) }));
    const taskCommands = new TaskCommandService(store, currentUser, clock, new SequenceIdGenerator(["concurrent-session"]));
    const reviewer: AIReviewer = {
      review: async () => {
        await taskCommands.execute({
          taskId, action: "start", ifMatch: task.etag, idempotencyKey: "concurrent-start-action-0001",
          method: "POST", route: `/api/tasks/${taskId}/start`, body: {},
        });
        return { provider: "stub-test", strengths: [], gaps: [], questions: [] };
      },
    };
    const service = new AIReviewService(store, currentUser, clock, new SequenceIdGenerator(["discarded-review"]), reviewer);

    await expect(service.create("TASK", taskId, "review-race-action-0001", `/api/ai/review/task/${taskId}`))
      .rejects.toMatchObject({ code: "AI_TARGET_CHANGED", status: 409 });
    await expect(store.read((state) => Object.keys(state.records.aiReviews))).resolves.toEqual([]);
    await expect(store.read((state) => state.records.tasks[taskId]?.status)).resolves.toBe("IN_PROGRESS");
  });

  it("does not allow AI review transactions to edit an existing advice record", async () => {
    const store = await makeStore();
    const currentUser = new LocalCurrentUserProvider(store);
    const service = new AIReviewService(store, currentUser, clock, new SequenceIdGenerator(["immutable-review"]), new StubAIReviewer());
    const created = await service.create("QUARTER", "q4-2026", "review-immutable-action-0001", "/api/ai/review/quarter/q4-2026");

    await expect(store.transact(STANDARD_INTENT, (draft) => {
      draft.records.aiReviews[created.review.id]!.summary = "silently edited";
      return { kind: "changed" as const, value: undefined };
    })).rejects.toMatchObject({ code: "STORE_WRITE_FAILED" });
  });
});
