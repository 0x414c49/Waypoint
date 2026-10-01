// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JsonJourneyStore } from "../../adapters/json-store/index.js";
import { LocalCurrentUserProvider } from "../../adapters/local-current-user-provider.js";
import { createProductionSeed } from "../../domain/production-seed.js";
import type { Clock } from "../../ports/clock.js";
import { SequenceIdGenerator } from "../../ports/id-generator.js";
import { taskEtag } from "../task-etag.js";
import { AppError } from "../app-error.js";
import { TaskCommandService, type TaskCommandRequest } from "./task-command-service.js";

class MutableClock implements Clock {
  constructor(private instant: string) {}
  now(): Date {
    return new Date(this.instant);
  }
  set(instant: string): void {
    this.instant = instant;
  }
}

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("TaskCommandService", () => {
  it("runs the daily loop atomically and replays receipts after later state changes", async () => {
    const root = await mkdtemp(join(tmpdir(), "journey-task-service-"));
    roots.push(root);
    const clock = new MutableClock("2026-11-03T17:00:00.000Z");
    const store = new JsonJourneyStore({
      directory: join(root, "store"),
      clock,
      idGenerator: new SequenceIdGenerator([
        "init-directory", "store-id", "commit-1", "commit-2", "commit-3", "commit-4",
      ]),
      seed: createProductionSeed,
    });
    await store.initialize();
    const service = new TaskCommandService(
      store,
      new LocalCurrentUserProvider(store),
      clock,
      new SequenceIdGenerator(["session-1", "finish-event-1", "review-1", "reopen-event-1"]),
    );
    const taskId = "2026-11-03-partial-failure";
    const etag = () => store.read((state) => taskEtag(state, state.records.tasks[taskId]!));
    const command = (
      action: TaskCommandRequest["action"],
      key: string,
      body: TaskCommandRequest["body"],
      ifMatch: string,
    ): TaskCommandRequest => ({
      action,
      taskId,
      body,
      ifMatch,
      idempotencyKey: key,
      method: "POST",
      route: `/api/tasks/${taskId}/${action}`,
    });

    const initialEtag = await etag();
    const startRequest = command("start", "start-command-0001", { intentionMinutes: 10 }, initialEtag);
    const started = await service.execute(startRequest);
    expect(started.response.task.status).toBe("IN_PROGRESS");
    expect(started.response.activeSession).toMatchObject({ id: "session-1", intentionMinutes: 10 });
    await expect(
      store.read((state) => ({
        taskSnapshot: state.records.tasks[taskId]?.planSnapshot,
        milestoneSnapshot: state.records.milestones["q4-2026-w05"]?.intentSnapshot,
        quarterSnapshot: state.records.quarters["q4-2026"]?.intentSnapshot,
        createdIds: state.commandReceipts["local-user:start-command-0001"]?.result.createdRecordIds,
      })),
    ).resolves.toMatchObject({
      taskSnapshot: { title: "Partial failure" },
      milestoneSnapshot: { title: "Week 5" },
      quarterSnapshot: { title: "Example Quarter — Engineering Practice" },
      createdIds: ["session-1"],
    });

    clock.set("2026-11-03T17:25:00.000Z");
    const paused = await service.execute(command("pause", "pause-command-0001", {}, await etag()));
    expect(paused.response.task.status).toBe("PAUSED");
    expect(paused.response.task.timing.actualSecondsAtGeneratedAt).toBe(1_500);
    expect(paused.response.dashboard.activityPreview.days.at(-1)).toMatchObject({
      sessionSeconds: 1_500,
      level: 2,
    });

    const replayedStart = await service.execute(startRequest);
    expect(replayedStart.replayed).toBe(true);
    expect(replayedStart.response.task.status).toBe("PAUSED");
    expect(await store.read((state) => Object.keys(state.records.sessions))).toEqual(["session-1"]);

    clock.set("2026-11-03T17:30:00.000Z");
    const finishRequest = command(
      "finish",
      "finish-command-01",
      { outcome: "PARTIAL", keyLearning: "Retries need a stable boundary." },
      await etag(),
    );
    const finished = await service.execute(finishRequest);
    expect(finished.response.task.status).toBe("FINISHED");
    expect(finished.response.completion).toMatchObject({
      finishEventId: "finish-event-1",
      reviewId: "review-1",
      outcome: "PARTIAL",
    });
    const reopenedStore = new JsonJourneyStore({
      directory: join(root, "store"),
      clock,
      idGenerator: new SequenceIdGenerator(["restart-commit"]),
      seed: createProductionSeed,
    });
    await reopenedStore.initialize();
    await expect(
      reopenedStore.read((state) => ({
        status: state.records.tasks[taskId]?.status,
        receipt: state.commandReceipts["local-user:finish-command-01"]?.result,
      })),
    ).resolves.toMatchObject({
      status: "FINISHED",
      receipt: { createdRecordIds: ["finish-event-1", "review-1"] },
    });
    const restartedService = new TaskCommandService(
      reopenedStore,
      new LocalCurrentUserProvider(reopenedStore),
      clock,
      new SequenceIdGenerator([]),
    );
    const finishReplay = await restartedService.execute(finishRequest);
    expect(finishReplay.replayed).toBe(true);
    expect(
      await store.read((state) => ({
        events: Object.keys(state.records.taskLifecycleEvents),
        reviews: Object.keys(state.records.dailyReviews),
      })),
    ).toEqual({ events: ["finish-event-1"], reviews: ["review-1"] });

    clock.set("2026-11-03T17:31:00.000Z");
    const reopened = await service.execute(
      command(
        "reopen",
        "reopen-command-01",
        { closureEventId: "finish-event-1" },
        await etag(),
      ),
    );
    expect(reopened.response.task.status).toBe("PAUSED");
    expect(reopened.response.reopened).toMatchObject({ reopenedEventId: "reopen-event-1" });
  });

  it("offers and atomically applies Pause current and switch", async () => {
    const root = await mkdtemp(join(tmpdir(), "journey-task-switch-"));
    roots.push(root);
    const clock = new MutableClock("2026-11-03T17:00:00.000Z");
    const store = new JsonJourneyStore({
      directory: join(root, "store"),
      clock,
      idGenerator: new SequenceIdGenerator([
        "init-directory", "store-id", "commit-1", "commit-2",
      ]),
      seed: createProductionSeed,
    });
    await store.initialize();
    const service = new TaskCommandService(
      store,
      new LocalCurrentUserProvider(store),
      clock,
      new SequenceIdGenerator(["session-current", "session-target"]),
    );
    const currentId = "2026-11-03-partial-failure";
    const targetId = "2026-11-04-adr-3-consistency";
    const currentEtag = await store.read((state) => taskEtag(state, state.records.tasks[currentId]!));
    await service.execute({
      action: "start", taskId: currentId, body: {}, ifMatch: currentEtag,
      idempotencyKey: "switch-start-0001", method: "POST", route: `/api/tasks/${currentId}/start`,
    });
    const targetEtag = await store.read((state) => taskEtag(state, state.records.tasks[targetId]!));
    const attempt: TaskCommandRequest = {
      action: "start", taskId: targetId, body: {}, ifMatch: targetEtag,
      idempotencyKey: "switch-target-001", method: "POST", route: `/api/tasks/${targetId}/start`,
    };
    let conflict: AppError | undefined;
    try {
      await service.execute(attempt);
    } catch (error) {
      if (error instanceof AppError) conflict = error;
    }
    expect(conflict).toMatchObject({ code: "ACTIVE_SESSION_CONFLICT" });
    expect(await store.read((state) => state.storeRevision)).toBe(1);

    clock.set("2026-11-03T17:10:00.000Z");
    const activeTaskEtag = await store.read((state) => taskEtag(state, state.records.tasks[currentId]!));
    const switched = await service.execute({
      ...attempt,
      body: {
        activeSessionResolution: {
          kind: "PAUSE_AND_SWITCH",
          activeSessionId: "session-current",
          activeTaskEtag,
        },
      },
    });
    expect(switched.response.task.status).toBe("IN_PROGRESS");
    expect(switched.response.activeSession?.id).toBe("session-target");
    expect(switched.response.affectedTasks).toEqual([
      expect.objectContaining({ id: currentId, status: "PAUSED" }),
    ]);
  });
});
