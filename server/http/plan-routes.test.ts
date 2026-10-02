// @vitest-environment node
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SqliteJourneyStore } from "../adapters/sqlite-store/index.js";
import { LocalCurrentUserProvider } from "../adapters/local-current-user-provider.js";
import { createNoHistorySeed } from "../domain/journey-state.js";
import { createProductionSeed } from "../domain/production-seed.js";
import { createStructuredLogger } from "../infrastructure/structured-logger.js";
import { RandomIdGenerator } from "../ports/id-generator.js";
import { buildApp } from "./build-app.js";

const roots: string[] = [];
const trusted = { host: "127.0.0.1:4173", origin: "http://127.0.0.1:4173", "content-type": "application/json" };
const fixture = readFileSync(resolve(process.cwd(), "planning/fixtures/example-quarter.yaml"), "utf8");
let app: Awaited<ReturnType<typeof buildApp>>;
let store: SqliteJourneyStore;
let setTime: (value: string) => void;

async function start(seed = createNoHistorySeed) {
  const root = await mkdtemp(join(tmpdir(), "journey-plan-http-")); roots.push(root);
  let instant = new Date("2026-11-03T17:00:00.000Z");
  setTime = (value) => { instant = new Date(value); };
  const clock = { now: () => new Date(instant) };
  const ids = new RandomIdGenerator();
  store = new SqliteJourneyStore({ directory: join(root, "store"), clock, idGenerator: ids, seed });
  await store.initialize();
  app = await buildApp({
    store, currentUserProvider: new LocalCurrentUserProvider(store), clock, idGenerator: ids,
    logger: createStructuredLogger("silent"), allowedHosts: new Set([trusted.host]), allowedMutationOrigins: new Set([trusted.origin]),
  });
}

afterEach(async () => {
  if (app) await app.close();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Slice 4 plan and Quarter HTTP", () => {
  beforeEach(async () => start());

  it("creates from the empty store, returns Quarter ETags, and exports current intent that reimports unchanged", async () => {
    const invalid = await app.inject({ method: "POST", url: "/api/plans/preview", headers: { ...trusted }, payload: { sourceFormat: "yaml", content: fixture, unexpected: true } });
    expect(invalid.statusCode).toBe(422);
    expect((await store.read((state) => state.storeRevision))).toBe(0);

    const preview = await app.inject({ method: "POST", url: "/api/plans/preview", headers: trusted, payload: { sourceFormat: "yaml", content: fixture } });
    expect(preview.statusCode, preview.body).toBe(200);
    expect(preview.json()).toMatchObject({ mode: "CREATE_QUARTER", quarterId: "q4-2026", basePlanRevision: null, summary: { added: 17, changed: 0, removed: 0, conflicts: 0 } });
    const competingCreate = await app.inject({ method: "POST", url: "/api/plans/preview", headers: trusted, payload: { sourceFormat: "yaml", content: fixture } });

    const missingGuard = await app.inject({ method: "POST", url: "/api/plans/apply", headers: { ...trusted, "idempotency-key": "plan-create-http-0001" }, payload: { previewToken: preview.json().previewToken, acknowledgementIds: [] } });
    expect(missingGuard.statusCode).toBe(428);
    const applied = await app.inject({ method: "POST", url: "/api/plans/apply", headers: { ...trusted, "if-none-match": "*", "idempotency-key": "plan-create-http-0001" }, payload: { previewToken: preview.json().previewToken, acknowledgementIds: [] } });
    expect(applied.statusCode, applied.body).toBe(201);
    expect(applied.headers.etag).toContain("quarter-");
    expect(applied.json()).toMatchObject({ quarterId: "q4-2026", planRevision: 1, mode: "CREATE_QUARTER" });
    const staleCreate = await app.inject({ method: "POST", url: "/api/plans/apply", headers: { ...trusted, "if-none-match": "*", "idempotency-key": "plan-create-http-0002" }, payload: { previewToken: competingCreate.json().previewToken, acknowledgementIds: [] } });
    expect(staleCreate.statusCode).toBe(412);
    expect(staleCreate.json().code).toBe("STALE_WRITE");

    const list = await app.inject({ method: "GET", url: "/api/quarters", headers: { host: trusted.host } });
    expect(list.json().items).toHaveLength(1);
    expect(list.json().items[0]).toMatchObject({ phase: "CURRENT", etag: applied.headers.etag });
    const detail = await app.inject({ method: "GET", url: "/api/quarters/q4-2026", headers: { host: trusted.host } });
    expect(detail.headers.etag).toBe(applied.headers.etag);
    expect(detail.json()).toMatchObject({ successCriteria: expect.arrayContaining([expect.objectContaining({ text: expect.any(String) })]), focusAreas: expect.any(Array), milestones: expect.any(Array) });
    expect(detail.json().successCriteria).toHaveLength(2);
    expect(detail.json().focusAreas).toHaveLength(2);
    expect(detail.json().milestones).toHaveLength(6);
    expect(detail.json().tasks).toHaveLength(8);
    expect(JSON.stringify(detail.json())).not.toContain("status");

    const exported = await app.inject({ method: "GET", url: "/api/plans/export/q4-2026", headers: { host: trusted.host } });
    expect(exported.headers["content-type"]).toContain("application/yaml");
    expect(exported.headers["content-disposition"]).toContain("q4-2026-plan.yaml");
    expect(exported.headers.etag).toBe(applied.headers.etag);
    expect(exported.body).not.toMatch(/\n\s*(status|sessions|outcome|reflection|planSnapshot):/i);
    const roundTrip = await app.inject({ method: "POST", url: "/api/plans/preview", headers: trusted, payload: { sourceFormat: "yaml", content: exported.body } });
    expect(roundTrip.json()).toMatchObject({ summary: { added: 0, changed: 0, removed: 0, historicalPreserved: 0, conflicts: 0 }, changes: [] });
  });

  it("replays a committed plan apply before expired-preview checks and rejects a stale writer", async () => {
    const createdPreview = await app.inject({ method: "POST", url: "/api/plans/preview", headers: trusted, payload: { sourceFormat: "yaml", content: fixture } });
    const created = await app.inject({ method: "POST", url: "/api/plans/apply", headers: { ...trusted, "if-none-match": "*", "idempotency-key": "plan-expiry-create-0001" }, payload: { previewToken: createdPreview.json().previewToken, acknowledgementIds: [] } });
    const updateContent = fixture.replace("title: Partial failure", "title: Updated after first review");
    const updatePreview = await app.inject({ method: "POST", url: "/api/plans/preview", headers: trusted, payload: { sourceFormat: "yaml", content: updateContent } });
    const request = { previewToken: updatePreview.json().previewToken, acknowledgementIds: [] };
    const applied = await app.inject({ method: "POST", url: "/api/plans/apply", headers: { ...trusted, "if-match": created.headers.etag, "idempotency-key": "plan-expiry-update-0001" }, payload: request });
    expect(applied.statusCode).toBe(200);
    setTime("2026-11-03T17:31:00.000Z");
    const replay = await app.inject({ method: "POST", url: "/api/plans/apply", headers: { ...trusted, "if-match": created.headers.etag, "idempotency-key": "plan-expiry-update-0001" }, payload: request });
    expect(replay.statusCode).toBe(200);
    expect(replay.headers["idempotency-replayed"]).toBe("true");
    expect(replay.json().planRevision).toBe(2);
    const reused = await app.inject({ method: "POST", url: "/api/plans/apply", headers: { ...trusted, "if-match": created.headers.etag, "idempotency-key": "plan-expiry-update-0001" }, payload: { ...request, acknowledgementIds: ["different"] } });
    expect(reused.statusCode).toBe(409);
    expect(reused.json().code).toBe("IDEMPOTENCY_KEY_REUSED");
    const before = await store.read((state) => state.storeRevision);
    const fresh = await app.inject({ method: "POST", url: "/api/plans/preview", headers: trusted, payload: { sourceFormat: "yaml", content: fixture.replace("title: Partial failure", "title: Stale preview") } });
    const stale = await app.inject({ method: "POST", url: "/api/plans/apply", headers: { ...trusted, "if-match": created.headers.etag, "idempotency-key": "plan-expiry-stale-0001" }, payload: { previewToken: fresh.json().previewToken, acknowledgementIds: [] } });
    expect(stale.statusCode).toBe(412);
    expect(stale.json().code).toBe("STALE_WRITE");
    expect(await store.read((state) => state.storeRevision)).toBe(before);
  });

  it("enforces the YAML source limit and a route-specific 2 MiB JSON wrapper limit", async () => {
    const invalidLargeYaml = await app.inject({ method: "POST", url: "/api/plans/preview", headers: trusted, payload: { sourceFormat: "yaml", content: "x".repeat(300_000) } });
    expect(invalidLargeYaml.statusCode).toBe(422);
    expect(invalidLargeYaml.json().code).toBe("VALIDATION_FAILED");
    const oversizedUtf8Yaml = await app.inject({ method: "POST", url: "/api/plans/preview", headers: trusted, payload: { sourceFormat: "yaml", content: "é".repeat(524_289) } });
    expect(oversizedUtf8Yaml.statusCode).toBe(422);
    expect(oversizedUtf8Yaml.json().errors[0]).toContain("YAML source exceeds 1048576 bytes");
    const oversizedWrapper = await app.inject({ method: "POST", url: "/api/plans/preview", headers: trusted, payload: { sourceFormat: "yaml", content: "x".repeat(2 * 1024 * 1024) } });
    expect(oversizedWrapper.statusCode).toBe(413);
    expect(oversizedWrapper.json().code).toBe("PAYLOAD_TOO_LARGE");
    expect(await store.read((state) => state.storeRevision)).toBe(0);
  });
});

describe("active Task plan preservation over HTTP", () => {
  beforeEach(async () => start(createProductionSeed));

  it("requires acknowledgement and keeps the running session and captured plan intact", async () => {
    const taskId = "2026-11-03-partial-failure";
    const readTask = await app.inject({ method: "GET", url: `/api/tasks/${taskId}`, headers: { host: trusted.host } });
    const startResponse = await app.inject({ method: "POST", url: `/api/tasks/${taskId}/start`, headers: { ...trusted, "if-match": readTask.json().task.etag, "idempotency-key": "plan-http-start-0001" }, payload: {} });
    expect(startResponse.statusCode).toBe(200);
    const initial = await store.read((state) => ({ session: structuredClone(Object.values(state.records.sessions)[0]), snapshot: structuredClone(state.records.tasks[taskId]?.planSnapshot) }));

    const content = fixture.replace("title: Partial failure", "title: A changed but still running experiment");
    const preview = await app.inject({ method: "POST", url: "/api/plans/preview", headers: trusted, payload: { sourceFormat: "yaml", content } });
    const required = preview.json().requiredAcknowledgements;
    expect(required).toHaveLength(1);
    expect(required[0].code).toBe("PRESERVE_ACTIVE_WORK");
    const missing = await app.inject({ method: "POST", url: "/api/plans/apply", headers: { ...trusted, "if-match": preview.json().baseEtag, "idempotency-key": "plan-http-active-0001" }, payload: { previewToken: preview.json().previewToken, acknowledgementIds: [] } });
    expect(missing.statusCode).toBe(409);
    expect(missing.json().code).toBe("ACKNOWLEDGEMENT_REQUIRED");
    const applied = await app.inject({ method: "POST", url: "/api/plans/apply", headers: { ...trusted, "if-match": preview.json().baseEtag, "idempotency-key": "plan-http-active-0001" }, payload: { previewToken: preview.json().previewToken, acknowledgementIds: [required[0].id] } });
    expect(applied.statusCode, applied.body).toBe(200);
    const after = await store.read((state) => ({ task: state.records.tasks[taskId], session: Object.values(state.records.sessions)[0], snapshot: state.records.tasks[taskId]?.planSnapshot }));
    expect(after.task).toMatchObject({ status: "IN_PROGRESS", title: "A changed but still running experiment" });
    expect(after.session).toEqual(initial.session);
    expect(after.snapshot).toEqual(initial.snapshot);
  });
});
