// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteJourneyStore } from "../../adapters/sqlite-store/index.js";
import { LocalCurrentUserProvider } from "../../adapters/local-current-user-provider.js";
import { createProductionSeed } from "../../domain/production-seed.js";
import type { Clock } from "../../ports/clock.js";
import { SequenceIdGenerator } from "../../ports/id-generator.js";
import { taskEtag } from "../task-etag.js";
import { TaskCommandService } from "./task-command-service.js";
import { CarryForwardService } from "./carry-forward-service.js";

class MutableClock implements Clock {
  constructor(private instant: string) {}
  now() { return new Date(this.instant); }
  set(value: string) { this.instant = value; }
}

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("CarryForwardService", () => {
  it("creates one linked continuation and safely replays across restart and a new key", async () => {
    const root = await mkdtemp(join(tmpdir(), "journey-carry-")); roots.push(root);
    const clock = new MutableClock("2026-11-03T17:00:00.000Z");
    const directory = join(root, "store");
    const store = new SqliteJourneyStore({ directory, clock, idGenerator: new SequenceIdGenerator(["init", "store", "commit-start", "commit-carry", "commit-noop"]), seed: createProductionSeed });
    await store.initialize();
    const user = new LocalCurrentUserProvider(store);
    const taskId = "2026-11-03-partial-failure";
    const commands = new TaskCommandService(store, user, clock, new SequenceIdGenerator(["source-session"]));
    const initialEtag = await store.read((state) => taskEtag(state, state.records.tasks[taskId]!));
    await commands.execute({ action: "start", taskId, body: {}, ifMatch: initialEtag, idempotencyKey: "carry-start-00001", method: "POST", route: `/api/tasks/${taskId}/start` });
    await store.transact({ kind: "PLAN_APPLY" }, (draft) => {
      draft.records.tasks[taskId]!.decisionPrompt = { decisionId: "later-plan-prompt", suggestedTitle: "Added after history began" };
      return { kind: "changed" as const, value: undefined };
    });
    clock.set("2026-11-03T17:30:00.000Z");
    const openEtag = await store.read((state) => taskEtag(state, state.records.tasks[taskId]!));
    const carry = new CarryForwardService(store, user, clock, new SequenceIdGenerator(["continuation-1", "finish-1", "review-1", "carried-1"]));
    const request = { plannedDate: "2026-11-04", keyLearning: "The read path is done." };
    const first = await carry.execute(taskId, request, openEtag, "carry-command-0001", `/api/tasks/${taskId}/carry-forward`);
    expect(first.response).toMatchObject({ source: { status: "FINISHED" }, continuation: { id: "continuation-1", status: "NOT_STARTED" }, completion: { outcome: "PARTIAL", finishEventId: "finish-1" } });
    expect(first.response.continuation.decisionContext).toBeUndefined();
    await expect(store.read((state) => ({ sessions: Object.values(state.records.sessions), receipt: state.commandReceipts["local-user:carry-command-0001"]?.result, carryEvent: state.records.taskLifecycleEvents["carried-1"], continuationPrompt: state.records.tasks["continuation-1"]?.decisionPrompt }))).resolves.toMatchObject({
      sessions: [{ id: "source-session", endedAt: "2026-11-03T17:30:00.000Z" }],
      receipt: { createdRecordIds: ["continuation-1", "finish-1", "review-1", "carried-1"] },
      carryEvent: { relatedTaskId: "continuation-1" },
      continuationPrompt: undefined,
    });

    const restarted = new SqliteJourneyStore({ directory, clock, idGenerator: new SequenceIdGenerator(["restart-commit"]), seed: createProductionSeed });
    await restarted.initialize();
    const restartedService = new CarryForwardService(restarted, new LocalCurrentUserProvider(restarted), clock, new SequenceIdGenerator([]));
    const replay = await restartedService.execute(taskId, request, openEtag, "carry-command-0001", `/api/tasks/${taskId}/carry-forward`);
    expect(replay.replayed).toBe(true);
    expect(replay.response.continuation.id).toBe("continuation-1");
    const currentEtag = await restarted.read((state) => taskEtag(state, state.records.tasks[taskId]!));
    const newKey = await restartedService.execute(taskId, request, currentEtag, "carry-command-0002", `/api/tasks/${taskId}/carry-forward`);
    expect(newKey.replayed).toBe(false);
    await expect(restarted.read((state) => ({ continuations: Object.values(state.records.tasks).filter((task) => task.continuationOfTaskId === taskId).length, created: state.commandReceipts["local-user:carry-command-0002"]?.result.createdRecordIds }))).resolves.toEqual({ continuations: 1, created: [] });

    const reopen = new TaskCommandService(restarted, new LocalCurrentUserProvider(restarted), clock, new SequenceIdGenerator([]));
    await expect(reopen.execute({ action: "reopen", taskId, body: { closureEventId: "finish-1" }, ifMatch: currentEtag, idempotencyKey: "carry-reopen-00001", method: "POST", route: `/api/tasks/${taskId}/reopen` })).rejects.toMatchObject({ code: "OPEN_CONTINUATION_EXISTS" });
  });
});
