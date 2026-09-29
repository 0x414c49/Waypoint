// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonJourneyStore } from "../adapters/json-store/index.js";
import { LocalCurrentUserProvider } from "../adapters/local-current-user-provider.js";
import { createProductionSeed } from "../domain/production-seed.js";
import { JourneyCommandService } from "../application/journey/journey-command-service.js";
import { createStructuredLogger } from "../infrastructure/structured-logger.js";
import { FixedClock } from "../ports/clock.js";
import { RandomIdGenerator, SequenceIdGenerator } from "../ports/id-generator.js";
import { buildApp } from "./build-app.js";

const roots: string[] = [];
const clock = new FixedClock(new Date("2026-11-03T17:00:00.000Z"));
let store: JsonJourneyStore;
let app: Awaited<ReturnType<typeof buildApp>>;
const trusted = { host: "127.0.0.1:4173", origin: "http://127.0.0.1:4173" };

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), "journey-search-http-"));
  roots.push(root);
  store = new JsonJourneyStore({ directory: join(root, "store"), clock, idGenerator: new RandomIdGenerator(), seed: createProductionSeed });
  await store.initialize();
  app = await buildApp({
    store,
    currentUserProvider: new LocalCurrentUserProvider(store),
    idGenerator: new RandomIdGenerator(),
    clock,
    logger: createStructuredLogger("silent"),
    allowedHosts: new Set([trusted.host]),
    allowedMutationOrigins: new Set([trusted.origin]),
  });
});

afterEach(async () => {
  if (app) await app.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("global Search routes", () => {
  it("returns grouped canonical Search results without frontend route strings", async () => {
    const response = await app.inject({ method: "GET", url: "/api/search?q=Idempotency", headers: { host: trusted.host } });

    expect(response.statusCode).toBe(200);
    const result = response.json();
    expect(result).toMatchObject({ query: "Idempotency", nextCursor: null });
    expect(result.groups.find((group: { type: string }) => group.type === "PLAN")?.items[0]).toMatchObject({
      contentType: "TASK", id: "2026-10-20-idempotency", taskId: "2026-10-20-idempotency",
    });
    expect(response.body).not.toContain("/tasks/");
  });

  it("opens one Journey thought at its canonical resource and its related plan context", async () => {
    const created = await new JourneyCommandService(store, new LocalCurrentUserProvider(store), clock, new SequenceIdGenerator(["http-thought-entry"]))
      .create({ text: "Search should land on this thought.", relatedTaskId: "2026-10-05-go-foundations" }, "http-search-thought-create-0001");
    const response = await app.inject({ method: "GET", url: `/api/journey/${created.entry.id}`, headers: { host: trusted.host } });

    expect(response.statusCode).toBe(200);
    expect(response.headers.etag).toBe(created.entry.etag);
    expect(response.json()).toMatchObject({ id: created.entry.id, type: "THOUGHT", relatedTask: { id: "2026-10-05-go-foundations" } });
  });
});
