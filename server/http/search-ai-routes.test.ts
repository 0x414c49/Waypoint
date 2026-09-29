// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonJourneyStore } from "../adapters/json-store/index.js";
import { StubAIReviewer } from "../adapters/stub-ai-reviewer.js";
import { LocalCurrentUserProvider } from "../adapters/local-current-user-provider.js";
import { createProductionSeed } from "../domain/production-seed.js";
import { JourneyCommandService } from "../application/journey/journey-command-service.js";
import { DecisionCommandService } from "../application/decisions/decision-command-service.js";
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
  const root = await mkdtemp(join(tmpdir(), "journey-search-ai-http-"));
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
    aiReviewer: new StubAIReviewer(),
  });
});

afterEach(async () => {
  if (app) await app.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("global search and AI review routes", () => {
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

  it("creates a deterministic, idempotent task review and exposes its history", async () => {
    const url = "/api/ai/review/task/2026-10-05-go-foundations";
    const headers = { host: trusted.host, origin: trusted.origin, "content-type": "application/json", "idempotency-key": "http-task-review-action-0001" };
    const missingKey = await app.inject({ method: "POST", url, headers: { host: trusted.host, origin: trusted.origin }, payload: {} });
    expect(missingKey.statusCode).toBe(422);

    const response = await app.inject({ method: "POST", url, headers, payload: {} });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ targetType: "TASK", targetId: "2026-10-05-go-foundations", provider: "stub", model: "deterministic-v1" });

    const replay = await app.inject({ method: "POST", url, headers, payload: {} });
    expect(replay.statusCode).toBe(201);
    expect(replay.headers["idempotency-replayed"]).toBe("true");
    expect(replay.json().id).toBe(response.json().id);

    const history = await app.inject({ method: "GET", url: "/api/ai/reviews?targetType=TASK&targetId=2026-10-05-go-foundations", headers: { host: trusted.host } });
    expect(history.statusCode).toBe(200);
    expect(history.json().items).toHaveLength(1);
    const state = await store.read((current) => current);
    expect(state.records.tasks["2026-10-05-go-foundations"]?.status).toBe("NOT_STARTED");
    expect(Object.keys(state.records.aiReviews)).toHaveLength(1);
  });

  it("opens one Journey thought at its canonical resource and its related plan context", async () => {
    const created = await new JourneyCommandService(store, new LocalCurrentUserProvider(store), clock, new SequenceIdGenerator(["http-thought-entry"]))
      .create({ text: "Search should land on this thought.", relatedTaskId: "2026-10-05-go-foundations" }, "http-search-thought-create-0001");
    const response = await app.inject({ method: "GET", url: `/api/journey/${created.entry.id}`, headers: { host: trusted.host } });

    expect(response.statusCode).toBe(200);
    expect(response.headers.etag).toBe(created.entry.etag);
    expect(response.json()).toMatchObject({ id: created.entry.id, type: "THOUGHT", relatedTask: { id: "2026-10-05-go-foundations" } });
  });

  it("dispatches Week, Quarter, and Decision reviews through their documented target routes", async () => {
    const decision = await new DecisionCommandService(store, new LocalCurrentUserProvider(store), clock, new RandomIdGenerator())
      .create({ title: "Review retry boundaries", quarterId: "q4-2026" }, "create-http-decision-for-ai-0001");
    const actions = [
      { url: "/api/ai/review/week", body: { milestoneId: "q4-2026-w01" }, key: "http-week-review-action-0001", targetType: "WEEK", targetId: "q4-2026-w01" },
      { url: "/api/ai/review/quarter/q4-2026", body: {}, key: "http-quarter-review-action-0001", targetType: "QUARTER", targetId: "q4-2026" },
      { url: `/api/ai/review/decision/${decision.decision.id}`, body: {}, key: "http-decision-review-action-0001", targetType: "DECISION", targetId: decision.decision.id },
    ];

    for (const action of actions) {
      const response = await app.inject({
        method: "POST", url: action.url,
        headers: { host: trusted.host, origin: trusted.origin, "content-type": "application/json", "idempotency-key": action.key },
        payload: action.body,
      });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ targetType: action.targetType, targetId: action.targetId, provider: "stub" });
    }
  });
});
