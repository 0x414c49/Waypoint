// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { JsonJourneyStore } from "../adapters/json-store/index.js";
import { LocalCurrentUserProvider } from "../adapters/local-current-user-provider.js";
import { createProductionSeed } from "../domain/production-seed.js";
import { createStructuredLogger } from "../infrastructure/structured-logger.js";
import { FixedClock } from "../ports/clock.js";
import { RandomIdGenerator } from "../ports/id-generator.js";
import { buildApp } from "./build-app.js";

const roots: string[] = [];
const trusted = { host: "127.0.0.1:4173", origin: "http://127.0.0.1:4173", "content-type": "application/json" };
let app: Awaited<ReturnType<typeof buildApp>>;
let store: JsonJourneyStore;

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), "journey-decisions-")); roots.push(root);
  const clock = new FixedClock(new Date("2026-11-03T17:00:00.000Z")); const ids = new RandomIdGenerator();
  store = new JsonJourneyStore({ directory: join(root, "store"), clock, idGenerator: ids, seed: createProductionSeed });
  await store.initialize();
  app = await buildApp({ store, currentUserProvider: new LocalCurrentUserProvider(store), clock, idGenerator: ids, logger: createStructuredLogger("silent"), allowedHosts: new Set([trusted.host]), allowedMutationOrigins: new Set([trusted.origin]) });
});
afterEach(async () => { await app.close(); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function task(taskId: string) {
  const response = await app.inject({ method: "GET", url: `/api/tasks/${taskId}`, headers: { host: trusted.host } });
  return response.json().task;
}
async function contextual(taskId = "2026-11-04-adr-3-consistency", key = "decision-context-0001") {
  const current = await task(taskId);
  return app.inject({ method: "POST", url: `/api/tasks/${taskId}/decision-draft`, headers: { ...trusted, "if-match": current.etag, "idempotency-key": key }, payload: {} });
}
const complete = {
  title: "Strong vs eventual consistency",
  decisionDate: "2026-11-03",
  context: "The read model spans two failure domains.",
  constraints: ["Writes must remain available."],
  options: [{ id: "strong", title: "Strong", description: "Coordinate every write.", strengths: ["Simple reads"], weaknesses: ["Lower availability"] }],
  decision: "Use eventual consistency with explicit freshness boundaries.",
  consequences: "Readers expose freshness.", assumptions: ["Consumers tolerate bounded delay."],
  falsifier: "Observed stale reads violate the product contract.", initialReviewDate: "2026-11-03",
};

describe("Slice 3 Decision HTTP", () => {
  it("creates one contextual Draft, captures plan context, replays, and leaves Task lifecycle unchanged", async () => {
    const first = await contextual();
    expect(first.statusCode, first.body).toBe(201);
    expect(first.json()).toMatchObject({ id: "q4-2026-adr-3", status: "DRAFT", title: "Strong vs eventual consistency for a real feature", relatedTask: { id: "2026-11-04-adr-3-consistency" } });
    const replay = await app.inject({ method: "POST", url: "/api/tasks/2026-11-04-adr-3-consistency/decision-draft", headers: { ...trusted, "if-match": (await task("2026-11-04-adr-3-consistency")).etag, "idempotency-key": "decision-context-0002" }, payload: {} });
    expect(replay.statusCode).toBe(200);
    const current = await task("2026-11-04-adr-3-consistency");
    expect(current).toMatchObject({ status: "NOT_STARTED", decisionContext: { action: "OPEN_DECISION", decision: { id: "q4-2026-adr-3", status: "DRAFT" } } });
    await expect(store.read((state) => ({ task: state.records.tasks["2026-11-04-adr-3-consistency"]?.planSnapshot?.title, milestone: state.records.milestones["q4-2026-w05"]?.intentSnapshot?.title, quarter: state.records.quarters["q4-2026"]?.intentSnapshot?.title, count: Object.keys(state.records.decisionRecords).length }))).resolves.toEqual({ task: "ADR-3 — Strong vs eventual consistency", milestone: "Week 5", quarter: "Q4 2026 — Engineering Growth", count: 1 });
  });

  it("does not borrow a later current-plan prompt when historical Task context had none", async () => {
    const taskId = "2026-11-03-partial-failure";
    const linked = await app.inject({ method: "POST", url: "/api/journey", headers: { ...trusted, "idempotency-key": "decision-history-0001" }, payload: { text: "Capture the original task context.", relatedTaskId: taskId } });
    expect(linked.statusCode, linked.body).toBe(201);
    await store.transact({ kind: "PLAN_APPLY" }, (draft) => {
      draft.records.tasks[taskId]!.decisionPrompt = { decisionId: "later-plan-decision", suggestedTitle: "Added only in the later plan" };
      return { kind: "changed" as const, value: undefined };
    });
    const projected = await task(taskId);
    expect(projected.decisionContext).toBeUndefined();
    const create = await app.inject({ method: "POST", url: `/api/tasks/${taskId}/decision-draft`, headers: { ...trusted, "if-match": projected.etag, "idempotency-key": "decision-history-0002" }, payload: {} });
    expect(create.statusCode).toBe(422);
    expect(create.json().code).toBe("VALIDATION_FAILED");
  });

  it("edits and explicitly accepts a Draft, derives a quiet due item, and rejects later edits", async () => {
    const created = await contextual();
    const saved = await app.inject({ method: "PUT", url: "/api/decisions/q4-2026-adr-3", headers: { ...trusted, "if-match": created.json().etag }, payload: complete });
    expect(saved.statusCode, saved.body).toBe(200);
    const accepted = await app.inject({ method: "POST", url: "/api/decisions/q4-2026-adr-3/accept", headers: { ...trusted, "if-match": saved.json().etag, "idempotency-key": "decision-accept-0001" }, payload: {} });
    expect(accepted.statusCode, accepted.body).toBe(200);
    expect(accepted.json()).toMatchObject({ status: "ACCEPTED", currentDueDate: "2026-11-03" });
    const dashboard = await app.inject({ method: "GET", url: "/api/dashboard", headers: { host: trusted.host } });
    expect(dashboard.json()).toMatchObject({ state: "READY", hero: { primaryAction: { kind: "START" } }, decisionReviewsDue: { count: 1, items: [{ decisionId: "q4-2026-adr-3", dueDate: "2026-11-03" }] } });
    const immutable = await app.inject({ method: "PUT", url: "/api/decisions/q4-2026-adr-3", headers: { ...trusted, "if-match": accepted.json().etag }, payload: { ...complete, decision: "Rewrite hindsight." } });
    expect(immutable.statusCode).toBe(409); expect(immutable.json().code).toBe("DECISION_IMMUTABLE");
    expect((await task("2026-11-04-adr-3-consistency")).status).toBe("NOT_STARTED");
  });

  it("rejects malformed and blank option content as request validation", async () => {
    const created = await contextual();
    const invalidId = await app.inject({ method: "PUT", url: "/api/decisions/q4-2026-adr-3", headers: { ...trusted, "if-match": created.json().etag }, payload: { ...complete, options: [{ ...complete.options[0], id: "INVALID UPPER" }] } });
    expect(invalidId.statusCode).toBe(422);
    expect(invalidId.json().code).toBe("VALIDATION_FAILED");
    const blank = await app.inject({ method: "PUT", url: "/api/decisions/q4-2026-adr-3", headers: { ...trusted, "if-match": created.json().etag }, payload: { ...complete, options: [{ ...complete.options[0], title: " ", description: " " }] } });
    expect(blank.statusCode).toBe(422);
    expect(blank.json().code).toBe("VALIDATION_FAILED");
  });

  it("serializes concurrent reviews, orders equal instants by sequence, and derives Journey and milestone facts once", async () => {
    const created = await contextual();
    const saved = await app.inject({ method: "PUT", url: "/api/decisions/q4-2026-adr-3", headers: { ...trusted, "if-match": created.json().etag }, payload: complete });
    const accepted = await app.inject({ method: "POST", url: "/api/decisions/q4-2026-adr-3/accept", headers: { ...trusted, "if-match": saved.json().etag, "idempotency-key": "decision-accept-0002" }, payload: {} });
    const request = (key: string, notes: string) => app.inject({ method: "POST", url: "/api/decisions/q4-2026-adr-3/review", headers: { ...trusted, "if-match": accepted.json().etag, "idempotency-key": key }, payload: { outcome: "ADJUST", notes, nextReviewDate: "2026-12-01" } });
    const results = await Promise.all([request("decision-review-0001", "Keep a smaller cache."), request("decision-review-0002", "Change the quorum.")]);
    expect(results.map((result) => result.statusCode).sort()).toEqual([201, 412]);
    const stale = results.find((result) => result.statusCode === 412)!;
    expect(stale.headers["content-type"]).toContain("application/problem+json");
    expect(stale.json()).toMatchObject({
      status: 412,
      code: "STALE_WRITE",
      detail: "Refresh it before adding a review.",
    });
    const winner = results.find((result) => result.statusCode === 201)!;
    const replay = await request(winner.json().reviews[0].notes.includes("cache") ? "decision-review-0001" : "decision-review-0002", winner.json().reviews[0].notes);
    expect(replay.statusCode).toBe(201); expect(replay.headers["idempotency-replayed"]).toBe("true");
    const journey = await app.inject({ method: "GET", url: "/api/journey?type=DECISION_REVIEW", headers: { host: trusted.host } });
    expect(journey.json().items).toHaveLength(1);
    expect(journey.json().items[0]).toMatchObject({ type: "DECISION_REVIEW", decision: { id: "q4-2026-adr-3" }, outcome: "ADJUST", substantive: true });
    const summary = await app.inject({ method: "GET", url: "/api/quarters/q4-2026/milestones/q4-2026-w05/summary", headers: { host: trusted.host } });
    expect(summary.json().eventsDuringPeriod.decisionsReviewed).toBe(1);
    expect(await store.read((state) => Object.values(state.records.decisionReviews).map((review) => review.sequence))).toEqual([1]);
  });

  it("records Postpone without inflating substantive review counts, then atomically links a Draft replacement on Supersede", async () => {
    const created = await contextual();
    const saved = await app.inject({ method: "PUT", url: "/api/decisions/q4-2026-adr-3", headers: { ...trusted, "if-match": created.json().etag }, payload: complete });
    const accepted = await app.inject({ method: "POST", url: "/api/decisions/q4-2026-adr-3/accept", headers: { ...trusted, "if-match": saved.json().etag, "idempotency-key": "decision-accept-0003" }, payload: {} });
    const invalid = await app.inject({ method: "POST", url: "/api/decisions/q4-2026-adr-3/review", headers: { ...trusted, "if-match": accepted.json().etag, "idempotency-key": "decision-defer-bad1" }, payload: { outcome: "DEFERRED" } });
    expect(invalid.statusCode).toBe(422);
    const deferred = await app.inject({ method: "POST", url: "/api/decisions/q4-2026-adr-3/review", headers: { ...trusted, "if-match": accepted.json().etag, "idempotency-key": "decision-defer-0001" }, payload: { outcome: "DEFERRED", nextReviewDate: "2026-12-01" } });
    expect(deferred.statusCode, deferred.body).toBe(201); expect(deferred.json().currentDueDate).toBe("2026-12-01");
    const replacement = await app.inject({ method: "POST", url: "/api/decisions", headers: { ...trusted, "idempotency-key": "decision-create-0001" }, payload: { title: "Replacement consistency boundary", quarterId: "q4-2026" } });
    expect(replacement.statusCode, replacement.body).toBe(201);
    const superseded = await app.inject({ method: "POST", url: "/api/decisions/q4-2026-adr-3/review", headers: { ...trusted, "if-match": deferred.json().etag, "idempotency-key": "decision-super-0001" }, payload: { outcome: "SUPERSEDE", notes: "The failure boundary changed.", replacementDecisionId: replacement.json().id } });
    expect(superseded.statusCode, superseded.body).toBe(201); expect(superseded.json()).toMatchObject({ status: "SUPERSEDED", currentDueDate: null });
    const replacementDetail = await app.inject({ method: "GET", url: `/api/decisions/${replacement.json().id}`, headers: { host: trusted.host } });
    expect(replacementDetail.json().supersedesDecision).toMatchObject({ id: "q4-2026-adr-3" });
    const summary = await app.inject({ method: "GET", url: "/api/quarters/q4-2026/milestones/q4-2026-w05/summary", headers: { host: trusted.host } });
    expect(summary.json().eventsDuringPeriod.decisionsReviewed).toBe(1);
    expect(await store.read((state) => Object.values(state.records.decisionReviews).sort((a, b) => a.sequence - b.sequence).map((review) => [review.sequence, review.outcome]))).toEqual([[1, "DEFERRED"], [2, "SUPERSEDE"]]);
    const journey = await app.inject({ method: "GET", url: "/api/journey?type=DECISION_REVIEW", headers: { host: trusted.host } });
    expect(journey.json().items.map((item: { outcome: string }) => item.outcome)).toEqual(["SUPERSEDE", "DEFERRED"]);
  });

  it("supports stable due/all keyset lists and strict request bounds", async () => {
    const one = await app.inject({ method: "POST", url: "/api/decisions", headers: { ...trusted, "idempotency-key": "decision-list-00001" }, payload: { title: "First" } });
    const two = await app.inject({ method: "POST", url: "/api/decisions", headers: { ...trusted, "idempotency-key": "decision-list-00002" }, payload: { title: "Second" } });
    expect(one.statusCode).toBe(201); expect(two.statusCode).toBe(201);
    const firstPage = await app.inject({ method: "GET", url: "/api/decisions?limit=1", headers: { host: trusted.host } });
    expect(firstPage.json().items).toHaveLength(1); expect(firstPage.json().nextCursor).toBeTruthy();
    const secondPage = await app.inject({ method: "GET", url: `/api/decisions?limit=1&cursor=${encodeURIComponent(firstPage.json().nextCursor)}`, headers: { host: trusted.host } });
    expect(secondPage.json().items).toHaveLength(1); expect(secondPage.json().items[0].id).not.toBe(firstPage.json().items[0].id);
    const unknown = await app.inject({ method: "POST", url: "/api/decisions", headers: { ...trusted, "idempotency-key": "decision-list-00003" }, payload: { title: "No", invented: true } });
    expect(unknown.statusCode).toBe(422);
  });
});
