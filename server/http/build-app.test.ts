// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonJourneyStore } from "../adapters/json-store/index.js";
import { LocalCurrentUserProvider } from "../adapters/local-current-user-provider.js";
import { createNoHistorySeed } from "../domain/journey-state.js";
import { createStructuredLogger } from "../infrastructure/structured-logger.js";
import { FixedClock } from "../ports/clock.js";
import { SequenceIdGenerator } from "../ports/id-generator.js";
import { buildApp } from "./build-app.js";

const roots: string[] = [];
let app: Awaited<ReturnType<typeof buildApp>>;

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), "journey-http-test-"));
  roots.push(root);
  const ids = new SequenceIdGenerator([
    "init",
    "store",
    "request-1",
    "request-2",
    "request-3",
    "request-4",
  ]);
  const store = new JsonJourneyStore({
    directory: join(root, "store"),
    clock: new FixedClock(new Date("2026-09-27T10:00:00.000Z")),
    idGenerator: ids,
    seed: createNoHistorySeed,
  });
  await store.initialize();
  app = await buildApp({
    store,
    currentUserProvider: new LocalCurrentUserProvider(store),
    idGenerator: ids,
    logger: createStructuredLogger("silent"),
    allowedHosts: new Set(["127.0.0.1:4173", "localhost:4173"]),
    allowedMutationOrigins: new Set([
      "http://127.0.0.1:4173",
      "http://localhost:4173",
    ]),
    registerTestRoutes: true,
  });
});

afterEach(async () => {
  if (app) await app.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("local HTTP boundary", () => {
  it("serves the validated current user with secure headers", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/me",
      headers: { host: "127.0.0.1:4173" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: "local-user", name: "Ali" });
    expect(response.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("rejects a read with an untrusted Host", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/me",
      headers: { host: "tracker.example" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "UNTRUSTED_ORIGIN" });
  });

  it("rejects mutations with missing or foreign origins before routing", async () => {
    for (const origin of [undefined, "https://tracker.example"]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/not-built",
        headers: {
          host: "127.0.0.1:4173",
          ...(origin ? { origin } : {}),
        },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: "UNTRUSTED_ORIGIN" });
    }
  });

  it("returns Problem Details for an unknown API resource", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/not-built",
      headers: { host: "localhost:4173" },
    });
    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain("application/problem+json");
    expect(response.json()).toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });

  it("enforces the normal 256 KiB JSON body limit", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/test/body",
      headers: {
        host: "127.0.0.1:4173",
        origin: "http://127.0.0.1:4173",
        "content-type": "application/json",
      },
      payload: { value: "x".repeat(256 * 1024) },
    });
    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });
});
