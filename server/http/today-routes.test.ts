// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteJourneyStore } from "../adapters/sqlite-store/index.js";
import { LocalCurrentUserProvider } from "../adapters/local-current-user-provider.js";
import { createProductionSeed } from "../domain/production-seed.js";
import { createStructuredLogger } from "../infrastructure/structured-logger.js";
import { FixedClock } from "../ports/clock.js";
import { RandomIdGenerator } from "../ports/id-generator.js";
import { buildApp } from "./build-app.js";

const roots: string[] = [];
let app: Awaited<ReturnType<typeof buildApp>>;
const trusted = {
  host: "127.0.0.1:4173",
  origin: "http://127.0.0.1:4173",
  "content-type": "application/json",
};

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), "journey-today-http-"));
  roots.push(root);
  const clock = new FixedClock(new Date("2026-11-03T17:00:00.000Z"));
  const ids = new RandomIdGenerator();
  const store = new SqliteJourneyStore({
    directory: join(root, "store"),
    clock,
    idGenerator: ids,
    seed: createProductionSeed,
  });
  await store.initialize();
  app = await buildApp({
    store,
    currentUserProvider: new LocalCurrentUserProvider(store),
    clock,
    idGenerator: ids,
    logger: createStructuredLogger("silent"),
    allowedHosts: new Set(["127.0.0.1:4173"]),
    allowedMutationOrigins: new Set(["http://127.0.0.1:4173"]),
  });
});

afterEach(async () => {
  await app.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Today HTTP routes", () => {
  it("serves the server-resolved Ready dashboard", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/dashboard",
      headers: { host: trusted.host },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      state: "READY",
      hero: { task: { id: "2026-11-03-partial-failure" } },
      dataRevision: 0,
    });
  });

  it("requires preconditions and maps a valid-but-incomplete body to 422", async () => {
    const missingPrecondition = await app.inject({
      method: "POST",
      url: "/api/tasks/2026-11-03-partial-failure/start",
      headers: { ...trusted, "idempotency-key": "missing-etag-0001" },
      payload: {},
    });
    expect(missingPrecondition.statusCode).toBe(428);
    expect(missingPrecondition.json()).toMatchObject({ code: "PRECONDITION_REQUIRED" });

    const dashboard = await app.inject({ method: "GET", url: "/api/dashboard", headers: { host: trusted.host } });
    const etag = dashboard.json().hero.task.etag as string;
    const invalidFinish = await app.inject({
      method: "POST",
      url: "/api/tasks/2026-11-03-partial-failure/finish",
      headers: { ...trusted, "if-match": etag, "idempotency-key": "invalid-finish-01" },
      payload: {},
    });
    expect(invalidFinish.statusCode).toBe(422);
    expect(invalidFinish.headers["content-type"]).toContain("application/problem+json");
    expect(invalidFinish.json()).toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("starts once and replays the same HTTP command receipt", async () => {
    const dashboard = await app.inject({ method: "GET", url: "/api/dashboard", headers: { host: trusted.host } });
    const etag = dashboard.json().hero.task.etag as string;
    const request = {
      method: "POST" as const,
      url: "/api/tasks/2026-11-03-partial-failure/start",
      headers: { ...trusted, "if-match": etag, "idempotency-key": "start-http-000001" },
      payload: { intentionMinutes: 10 },
    };
    const first = await app.inject(request);
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json()).toMatchObject({
      task: { status: "IN_PROGRESS" },
      dashboard: { state: "RUNNING" },
      activeSession: { intentionMinutes: 10 },
    });
    const replay = await app.inject(request);
    expect(replay.statusCode).toBe(200);
    expect(replay.headers["idempotency-replayed"]).toBe("true");
    expect(replay.json().activeSession.id).toBe(first.json().activeSession.id);

    const pause = await app.inject({
      method: "POST",
      url: "/api/tasks/2026-11-03-partial-failure/pause",
      headers: {
        ...trusted,
        "if-match": first.json().task.etag,
        "idempotency-key": "pause-http-000001",
      },
      payload: {},
    });
    expect(pause.statusCode, pause.body).toBe(200);
    expect(pause.json().task.status).toBe("PAUSED");
    const resume = await app.inject({
      method: "POST",
      url: "/api/tasks/2026-11-03-partial-failure/resume",
      headers: {
        ...trusted,
        "if-match": pause.json().task.etag,
        "idempotency-key": "resume-http-00001",
      },
      payload: {},
    });
    expect(resume.statusCode, resume.body).toBe(200);
    expect(resume.json().task.status).toBe("IN_PROGRESS");
  });
});
