// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonJourneyStore } from "../adapters/json-store/index.js";
import { LocalCurrentUserProvider } from "../adapters/local-current-user-provider.js";
import { createProductionSeed } from "../domain/production-seed.js";
import { createStructuredLogger } from "../infrastructure/structured-logger.js";
import type { Clock } from "../ports/clock.js";
import { RandomIdGenerator } from "../ports/id-generator.js";
import { buildApp } from "./build-app.js";

class MutableClock implements Clock {
  constructor(private instant: string) {}
  now() { return new Date(this.instant); }
  set(instant: string) { this.instant = instant; }
}

const roots: string[] = [];
const trusted = { host: "127.0.0.1:4173", origin: "http://127.0.0.1:4173", "content-type": "application/json" };
let app: Awaited<ReturnType<typeof buildApp>>;
let store: JsonJourneyStore;
let clock: MutableClock;

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), "journey-slice-two-")); roots.push(root);
  clock = new MutableClock("2026-11-03T17:00:00.000Z");
  const ids = new RandomIdGenerator();
  store = new JsonJourneyStore({ directory: join(root, "store"), clock, idGenerator: ids, seed: createProductionSeed });
  await store.initialize();
  app = await buildApp({ store, currentUserProvider: new LocalCurrentUserProvider(store), clock, idGenerator: ids, logger: createStructuredLogger("silent"), allowedHosts: new Set([trusted.host]), allowedMutationOrigins: new Set([trusted.origin]) });
});

afterEach(async () => { await app.close(); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function start(taskId: string, key: string) {
  const tasks = await app.inject({ method: "GET", url: `/api/tasks?limit=100`, headers: { host: trusted.host } });
  const task = tasks.json().items.find((item: { id: string }) => item.id === taskId);
  return app.inject({ method: "POST", url: `/api/tasks/${taskId}/start`, headers: { ...trusted, "if-match": task.etag, "idempotency-key": key }, payload: {} });
}

describe("Slice 2 Journey HTTP", () => {
  it("infers the active task, normalizes defaults for replay, and preserves explicit null", async () => {
    expect((await start("2026-11-03-partial-failure", "slice2-start-00001")).statusCode).toBe(200);
    const request = { method: "POST" as const, url: "/api/journey", headers: { ...trusted, "idempotency-key": "thought-create-001" }, payload: { text: "Retries need ownership." } };
    const created = await app.inject(request);
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json()).toMatchObject({ tags: [], changedMyMind: false, relatedTask: { id: "2026-11-03-partial-failure" } });
    const replay = await app.inject({ ...request, payload: { text: "Retries need ownership.", tags: [], changedMyMind: false } });
    expect(replay.statusCode).toBe(201);
    expect(replay.headers["idempotency-replayed"]).toBe("true");
    expect(replay.json().id).toBe(created.json().id);

    const unlinked = await app.inject({ method: "POST", url: "/api/journey", headers: { ...trusted, "idempotency-key": "thought-create-002" }, payload: { text: "Standalone thought.", relatedTaskId: null } });
    expect(unlinked.json().relatedTask).toBeNull();
    const linkedLater = await app.inject({
      method: "PUT",
      url: `/api/journey/${unlinked.json().id}`,
      headers: { ...trusted, "if-match": unlinked.json().etag },
      payload: {
        text: "Standalone thought.", tags: [], changedMyMind: false,
        relatedTaskId: "2026-11-04-adr-3-consistency", relatedMilestoneId: null, relatedDecisionId: null,
      },
    });
    expect(linkedLater.statusCode, linkedLater.body).toBe(200);
    await expect(store.read((state) => ({
      task: state.records.tasks["2026-11-04-adr-3-consistency"]?.planSnapshot?.title,
      milestone: state.records.milestones["q4-2026-w05"]?.intentSnapshot?.title,
      quarter: state.records.quarters["q4-2026"]?.intentSnapshot?.title,
    }))).resolves.toEqual({ task: "ADR-3 — Strong vs eventual consistency", milestone: "Week 5", quarter: "Q4 2026 — Engineering Growth" });
    expect(await store.read((state) => Object.keys(state.records.journeyEntries))).toHaveLength(2);
  });

  it("updates with ETags, explicitly deletes one entry, and validates timeline dates", async () => {
    const created = await app.inject({ method: "POST", url: "/api/journey", headers: { ...trusted, "idempotency-key": "thought-edit-00001" }, payload: { text: "Before", relatedTaskId: "2026-11-04-adr-3-consistency" } });
    expect(created.statusCode).toBe(201);
    expect(await store.read((state) => state.records.tasks["2026-11-04-adr-3-consistency"]?.planSnapshot?.title)).toBe("ADR-3 — Strong vs eventual consistency");
    await store.transact({ kind: "PLAN_APPLY" }, (draft) => {
      draft.records.tasks["2026-11-04-adr-3-consistency"]!.title = "Current plan wording";
      return { kind: "changed", value: undefined };
    });
    const historicalTimeline = await app.inject({ method: "GET", url: "/api/journey?taskId=2026-11-04-adr-3-consistency", headers: { host: trusted.host } });
    expect(historicalTimeline.json().items[0].relatedTask.title).toBe("ADR-3 — Strong vs eventual consistency");
    const id = created.json().id as string;
    const updated = await app.inject({ method: "PUT", url: `/api/journey/${id}`, headers: { ...trusted, "if-match": created.json().etag }, payload: { text: "After", tags: ["retry"], changedMyMind: true, relatedTaskId: null, relatedMilestoneId: null, relatedDecisionId: null } });
    expect(updated.statusCode, updated.body).toBe(200);
    expect(updated.json()).toMatchObject({ text: "After", changedMyMind: true, relatedTask: null });
    const invalidRange = await app.inject({ method: "GET", url: "/api/journey?from=2026-02-31", headers: { host: trusted.host } });
    expect(invalidRange.statusCode).toBe(422);
    await expect(store.transact({ kind: "JOURNEY_DELETE", journeyEntryId: id }, (draft) => {
      delete draft.records.journeyEntries[id];
      draft.records.tasks["2026-11-03-partial-failure"]!.title = "Unrelated mutation";
      return { kind: "changed", value: undefined };
    })).rejects.toMatchObject({ code: "STORE_WRITE_FAILED" });
    expect(await store.read((state) => state.records.journeyEntries[id]?.text)).toBe("After");
    const deleted = await app.inject({ method: "DELETE", url: `/api/journey/${id}`, headers: { host: trusted.host, origin: trusted.origin, "if-match": updated.json().etag } });
    expect(deleted.statusCode).toBe(204);
    expect(await store.read((state) => state.records.journeyEntries[id])).toBeUndefined();
    const replayAfterDelete = await app.inject({
      method: "POST",
      url: "/api/journey",
      headers: { ...trusted, "idempotency-key": "thought-edit-00001" },
      payload: { text: "Before", relatedTaskId: "2026-11-04-adr-3-consistency" },
    });
    expect(replayAfterDelete.statusCode).toBe(410);
    expect(replayAfterDelete.json().code).toBe("IDEMPOTENT_RESULT_DELETED");
    expect(await store.read((state) => state.records.journeyEntries[id])).toBeUndefined();
  });

  it("does not duplicate Journey rows when a newer entry arrives between pages", async () => {
    const create = (text: string, key: string) => app.inject({
      method: "POST",
      url: "/api/journey",
      headers: { ...trusted, "idempotency-key": key },
      payload: { text, relatedTaskId: null },
    });
    const oldest = await create("Oldest", "timeline-oldest-001");
    clock.set("2026-11-03T18:00:00.000Z");
    const middle = await create("Middle", "timeline-middle-001");

    const first = await app.inject({ method: "GET", url: "/api/journey?limit=1", headers: { host: trusted.host } });
    expect(first.json().items.map((item: { id: string }) => item.id)).toEqual([middle.json().id]);

    clock.set("2026-11-03T19:00:00.000Z");
    await create("Newest", "timeline-newest-001");
    const second = await app.inject({
      method: "GET",
      url: `/api/journey?limit=1&cursor=${encodeURIComponent(first.json().nextCursor)}`,
      headers: { host: trusted.host },
    });
    expect(second.statusCode, second.body).toBe(200);
    expect(second.json().items.map((item: { id: string }) => item.id)).toEqual([oldest.json().id]);
  });

  it("corrects closed sessions, rejects invalid instants and overlap, and refreshes activity", async () => {
    const first = await start("2026-11-03-partial-failure", "session-start-0001");
    clock.set("2026-11-03T17:30:00.000Z");
    const paused = await app.inject({ method: "POST", url: "/api/tasks/2026-11-03-partial-failure/pause", headers: { ...trusted, "if-match": first.json().task.etag, "idempotency-key": "session-pause-0001" }, payload: {} });
    expect(paused.statusCode).toBe(200);
    clock.set("2026-11-03T18:00:00.000Z");
    const second = await start("2026-11-04-adr-3-consistency", "session-start-0002");
    clock.set("2026-11-03T18:30:00.000Z");
    await app.inject({ method: "POST", url: "/api/tasks/2026-11-04-adr-3-consistency/pause", headers: { ...trusted, "if-match": second.json().task.etag, "idempotency-key": "session-pause-0002" }, payload: {} });
    const sessions = await app.inject({ method: "GET", url: "/api/tasks/2026-11-03-partial-failure/sessions", headers: { host: trusted.host } });
    const session = sessions.json().items[0];
    const invalid = await app.inject({ method: "PUT", url: `/api/sessions/${session.id}`, headers: { ...trusted, "if-match": session.etag }, payload: { startedAt: "not-a-date", endedAt: session.endedAt } });
    expect(invalid.statusCode).toBe(422);
    const overlap = await app.inject({ method: "PUT", url: `/api/sessions/${session.id}`, headers: { ...trusted, "if-match": session.etag }, payload: { startedAt: "2026-11-03T18:05:00.000Z", endedAt: "2026-11-03T18:10:00.000Z" } });
    expect(overlap.statusCode).toBe(409);
    expect(overlap.json().code).toBe("SESSION_OVERLAP");
    const negative = await app.inject({ method: "PUT", url: `/api/sessions/${session.id}`, headers: { ...trusted, "if-match": session.etag }, payload: { startedAt: "2026-11-03T17:10:00.000Z", endedAt: "2026-11-03T17:09:59.000Z" } });
    expect(negative.statusCode).toBe(422);
    const corrected = await app.inject({ method: "PUT", url: `/api/sessions/${session.id}`, headers: { ...trusted, "if-match": session.etag }, payload: { startedAt: "2026-11-03T18:05:00.000Z", endedAt: "2026-11-03T18:05:00.000Z" } });
    expect(corrected.statusCode, corrected.body).toBe(200);
    expect(corrected.json()).toMatchObject({ actualSecondsAtGeneratedAt: 0, correctedAt: "2026-11-03T18:30:00.000Z" });
    const activity = await app.inject({ method: "GET", url: "/api/activity?from=2026-11-03&to=2026-11-03", headers: { host: trusted.host } });
    expect(activity.json().days[0]).toMatchObject({ sessionSeconds: 1800, level: 3 });
  });

  it("corrects an active session, rejects a stale ETag, and preserves task state across midnight", async () => {
    const started = await start("2026-11-03-partial-failure", "active-correction-start-001");
    const taskId = started.json().task.id as string;
    const activeSessions = await app.inject({ method: "GET", url: `/api/tasks/${taskId}/sessions`, headers: { host: trusted.host } });
    const active = activeSessions.json().items[0];
    const correctedActive = await app.inject({
      method: "PUT",
      url: `/api/sessions/${active.id}`,
      headers: { ...trusted, "if-match": active.etag },
      payload: { startedAt: "2026-11-03T16:55:00.000Z" },
    });
    expect(correctedActive.statusCode, correctedActive.body).toBe(200);
    expect(correctedActive.json()).toMatchObject({ startedAt: "2026-11-03T16:55:00.000Z", endedAt: null });

    const stale = await app.inject({
      method: "PUT",
      url: `/api/sessions/${active.id}`,
      headers: { ...trusted, "if-match": active.etag },
      payload: { startedAt: "2026-11-03T16:50:00.000Z" },
    });
    expect(stale.statusCode).toBe(412);

    const refreshedTask = await app.inject({ method: "GET", url: `/api/tasks/${taskId}`, headers: { host: trusted.host } });
    clock.set("2026-11-03T17:30:00.000Z");
    const paused = await app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/pause`,
      headers: { ...trusted, "if-match": refreshedTask.json().task.etag, "idempotency-key": "active-correction-pause-001" },
      payload: {},
    });
    expect(paused.statusCode, paused.body).toBe(200);
    const closedSessions = await app.inject({ method: "GET", url: `/api/tasks/${taskId}/sessions`, headers: { host: trusted.host } });
    const closed = closedSessions.json().items[0];
    const crossMidnight = await app.inject({
      method: "PUT",
      url: `/api/sessions/${closed.id}`,
      headers: { ...trusted, "if-match": closed.etag },
      payload: { startedAt: "2026-11-03T22:50:00.000Z", endedAt: "2026-11-03T23:20:00.000Z" },
    });
    expect(crossMidnight.statusCode, crossMidnight.body).toBe(200);
    const detail = await app.inject({ method: "GET", url: `/api/tasks/${taskId}`, headers: { host: trusted.host } });
    expect(detail.json()).toMatchObject({ task: { status: "PAUSED" }, reviews: [] });
    const activity = await app.inject({ method: "GET", url: "/api/activity?from=2026-11-03&to=2026-11-04", headers: { host: trusted.host } });
    expect(activity.json().days).toEqual([
      { date: "2026-11-03", sessionSeconds: 600, level: 1 },
      { date: "2026-11-04", sessionSeconds: 1200, level: 2 },
    ]);
  });

  it("lists tasks with bounded filters and stable cursor pagination", async () => {
    const first = await app.inject({ method: "GET", url: "/api/tasks?milestoneId=q4-2026-w05&limit=1", headers: { host: trusted.host } });
    expect(first.statusCode).toBe(200);
    expect(first.json().items).toHaveLength(1);
    expect(first.json().nextCursor).toEqual(expect.any(String));
    const second = await app.inject({ method: "GET", url: `/api/tasks?milestoneId=q4-2026-w05&limit=1&cursor=${first.json().nextCursor}`, headers: { host: trusted.host } });
    expect(second.statusCode).toBe(200);
    expect(second.json().items[0].id).not.toBe(first.json().items[0].id);
    const invalid = await app.inject({ method: "GET", url: "/api/tasks?plannedFrom=2026-02-31", headers: { host: trusted.host } });
    expect(invalid.statusCode).toBe(422);
  });
});
