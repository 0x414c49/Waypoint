// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteJourneyStore } from "../adapters/sqlite-store/index.js";
import { LocalCurrentUserProvider } from "../adapters/local-current-user-provider.js";
import { createProductionSeed } from "../domain/production-seed.js";
import { JourneyCommandService } from "../application/journey/journey-command-service.js";
import { searchRecords } from "../application/search/search.js";
import { createStructuredLogger } from "../infrastructure/structured-logger.js";
import { FixedClock } from "../ports/clock.js";
import { RandomIdGenerator, SequenceIdGenerator } from "../ports/id-generator.js";
import { buildApp } from "./build-app.js";

const roots: string[] = [];
const clock = new FixedClock(new Date("2026-11-03T17:00:00.000Z"));
let store: SqliteJourneyStore;
let directory: string;
let app: Awaited<ReturnType<typeof buildApp>>;
const trusted = { host: "127.0.0.1:4173", origin: "http://127.0.0.1:4173" };

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), "journey-search-http-"));
  roots.push(root);
  directory = join(root, "store");
  store = new SqliteJourneyStore({ directory, clock, idGenerator: new RandomIdGenerator(), seed: createProductionSeed });
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

  it("keeps substring, accent, filters, and cursor results identical to the scorer", async () => {
    await new JourneyCommandService(store, new LocalCurrentUserProvider(store), clock, new SequenceIdGenerator(["accented-thought"]))
      .create({ text: "Crème brûlée learning notes" }, "search-accented-thought-0001");
    for (const q of ["earn", "reme", "brul", "learning notes", "Idempotency"]) {
      const response = await app.inject({ method: "GET", url: `/api/search?q=${encodeURIComponent(q)}&limit=2`, headers: { host: trusted.host } });
      expect(response.statusCode, q).toBe(200);
      const expected = await store.read((state) => searchRecords(state, "local-user", { query: q, limit: 2 }));
      expect(response.json(), q).toEqual(expected);
      if (expected.nextCursor) {
        const page = await app.inject({ method: "GET", url: `/api/search?q=${encodeURIComponent(q)}&limit=2&cursor=${encodeURIComponent(expected.nextCursor)}`, headers: { host: trusted.host } });
        const next = await store.read((state) => searchRecords(state, "local-user", { query: q, limit: 2, cursor: expected.nextCursor! }));
        expect(page.json(), q).toEqual(next);
      }
    }
    const filtered = await app.inject({ method: "GET", url: "/api/search?q=learning&type=JOURNEY", headers: { host: trusted.host } });
    const expected = await store.read((state) => searchRecords(state, "local-user", { query: "learning", type: "JOURNEY", limit: 25 }));
    expect(filtered.json()).toEqual(expected);
  });

  it("rebuilds the substring index for an existing database", async () => {
    await app.close();
    store.close();
    const db = new DatabaseSync(join(directory, "waypoint.db"));
    db.exec("DROP TABLE search_substrings");
    db.close();
    const reopened = new SqliteJourneyStore({ directory, clock, idGenerator: new RandomIdGenerator(), seed: createProductionSeed });
    await reopened.initialize();
    const result = await reopened.search("local-user", { query: "earn", limit: 25 });
    expect(result.groups.flatMap((group) => group.items).length).toBeGreaterThan(0);
    reopened.close();
  });
});
