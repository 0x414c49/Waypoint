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
import { JourneyCommandService } from "./journey-command-service.js";

const clock: Clock = { now: () => new Date("2026-11-03T17:00:00.000Z") };
const roots: string[] = [];

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("JourneyCommandService", () => {
  it("replays thought creation after restart and rejects changed-body key reuse", async () => {
    const root = await mkdtemp(join(tmpdir(), "journey-thought-replay-"));
    roots.push(root);
    const directory = join(root, "store");
    const store = new JsonJourneyStore({
      directory,
      clock,
      idGenerator: new SequenceIdGenerator(["init", "store", "commit-create"]),
      seed: createProductionSeed,
    });
    await store.initialize();
    const service = new JourneyCommandService(store, new LocalCurrentUserProvider(store), clock, new SequenceIdGenerator(["thought-1"]));
    const body = { text: "Retries need one owner.", relatedTaskId: null };
    const created = await service.create(body, "thought-restart-0001");

    const restarted = new JsonJourneyStore({
      directory,
      clock,
      idGenerator: new SequenceIdGenerator(["restart-commit"]),
      seed: createProductionSeed,
    });
    await restarted.initialize();
    const restartedService = new JourneyCommandService(restarted, new LocalCurrentUserProvider(restarted), clock, new SequenceIdGenerator([]));
    const replayed = await restartedService.create(body, "thought-restart-0001");

    expect(replayed).toMatchObject({ replayed: true, entry: { id: created.entry.id } });
    await expect(restartedService.create({ ...body, text: "A different thought." }, "thought-restart-0001"))
      .rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    await expect(restarted.read((state) => Object.keys(state.records.journeyEntries))).resolves.toEqual(["thought-1"]);
  });
});
