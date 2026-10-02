// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteJourneyStore } from "../adapters/sqlite-store/index.js";
import { createNoHistorySeed } from "../domain/journey-state.js";
import { createStructuredLogger } from "../infrastructure/structured-logger.js";
import { FixedClock } from "../ports/clock.js";
import { SequenceIdGenerator } from "../ports/id-generator.js";
import { EmailPreferenceService, issueDigestUnsubscribeToken } from "../email/preferences.js";
import { AuthService, type PasswordHasher } from "../auth/auth-service.js";
import type { PasswordVerifier } from "../domain/journey-state.js";
import { buildApp } from "./build-app.js";

class FastHasher implements PasswordHasher {
  async hash(password: string): Promise<PasswordVerifier> { return { algorithm: "scrypt", version: 1, N: 2, r: 1, p: 1, maxmem: 1, salt: "s".repeat(22), derivedKey: `key:${password}`.padEnd(80, "k") }; }
  async verify(password: string, verifier: PasswordVerifier): Promise<boolean> { return verifier.derivedKey.startsWith(`key:${password}`); }
}

const KEY = Buffer.alloc(32, 7);
const HOST = "127.0.0.1:4173";
const ORIGIN = "http://127.0.0.1:4173";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "email-routes-test-")); roots.push(root);
  const clock = new FixedClock(new Date("2026-10-02T10:00:00.000Z"));
  const ids = new SequenceIdGenerator(Array.from({ length: 100 }, (_, index) => `id-${index}`));
  const store = new SqliteJourneyStore({ directory: join(root, "store"), clock, idGenerator: ids, seed: createNoHistorySeed });
  await store.initialize();
  const preferences = new EmailPreferenceService({ store, clock, key: KEY });
  const { AuthenticatedCurrentUserProvider } = await import("../adapters/authenticated-current-user-provider.js");
  const app = await buildApp({
    store, currentUserProvider: new AuthenticatedCurrentUserProvider(store), idGenerator: ids, clock,
    logger: createStructuredLogger("silent"),
    allowedHosts: new Set([HOST]), allowedMutationOrigins: new Set([ORIGIN]),
    emailPreferences: preferences,
  });
  return { app, preferences };
}

describe("public unsubscribe endpoints", () => {
  it("requires an explicit confirmation before changing either preference", async () => {
    const { app, preferences } = await setup();
    const token = issueDigestUnsubscribeToken("local-user", KEY);
    const unsub = await app.inject({ method: "GET", url: `/api/email/unsubscribe?token=${encodeURIComponent(token)}`, headers: { host: HOST } });
    expect(unsub.statusCode).toBe(200);
    expect(unsub.headers["content-type"]).toMatch(/text\/html/);
    expect(unsub.body).toMatch(/Confirm unsubscribe/i);
    await expect(preferences.isDigestUnsubscribed("local-user")).resolves.toBe(false);
    const confirmed = await app.inject({ method: "POST", url: `/api/email/unsubscribe?token=${encodeURIComponent(token)}`, headers: { host: HOST, origin: ORIGIN } });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.body).toMatch(/You're unsubscribed/i);
    await expect(preferences.isDigestUnsubscribed("local-user")).resolves.toBe(true);
    const resub = await app.inject({ method: "GET", url: `/api/email/resubscribe?token=${encodeURIComponent(token)}`, headers: { host: HOST } });
    expect(resub.statusCode).toBe(200);
    expect(resub.body).toMatch(/Confirm resubscribe/i);
    await expect(preferences.isDigestUnsubscribed("local-user")).resolves.toBe(true);
    const confirmedResub = await app.inject({ method: "POST", url: `/api/email/resubscribe?token=${encodeURIComponent(token)}`, headers: { host: HOST, origin: ORIGIN } });
    expect(confirmedResub.statusCode).toBe(200);
    expect(confirmedResub.body).toMatch(/subscribed again/i);
    await expect(preferences.isDigestUnsubscribed("local-user")).resolves.toBe(false);
    await app.close();
  });

  it("rejects forged tokens, unknown users, and missing tokens without revealing which", async () => {
    const { app } = await setup();
    const forged = issueDigestUnsubscribeToken("local-user", Buffer.alloc(32, 9));
    for (const token of [forged, issueDigestUnsubscribeToken("ghost-user", KEY), "garbage"]) {
      const response = await app.inject({ method: "GET", url: `/api/email/unsubscribe?token=${encodeURIComponent(token)}`, headers: { host: HOST } });
      expect(response.statusCode, token).toBe(404);
    }
    const missing = await app.inject({ method: "GET", url: "/api/email/unsubscribe", headers: { host: HOST } });
    expect(missing.statusCode).toBe(422);
    await app.close();
  });
});

describe("authenticated email preferences", () => {
  async function setupAuthed() {
    const root = await mkdtemp(join(tmpdir(), "email-prefs-test-")); roots.push(root);
    const clock = new FixedClock(new Date("2026-10-02T10:00:00.000Z"));
    const ids = new SequenceIdGenerator(Array.from({ length: 200 }, (_, index) => `pref-${index}`));
    const store = new SqliteJourneyStore({ directory: join(root, "store"), clock, idGenerator: ids, seed: createNoHistorySeed });
    await store.initialize();
    const { AuthenticatedCurrentUserProvider } = await import("../adapters/authenticated-current-user-provider.js");
    const provider = new AuthenticatedCurrentUserProvider(store);
    const auth = new AuthService({ store, clock, idGenerator: ids, totpEncryptionKey: Buffer.alloc(32, 1), passwordHasher: new FastHasher() });
    const preferences = new EmailPreferenceService({ store, clock, key: KEY });
    const app = await buildApp({
      store, currentUserProvider: provider, idGenerator: ids, clock,
      logger: createStructuredLogger("silent"),
      allowedHosts: new Set([HOST]), allowedMutationOrigins: new Set([ORIGIN]),
      authService: auth, emailPreferences: preferences,
    });
    const bootstrap = await auth.createBootstrapInvite("owner@example.com");
    const registered = await app.inject({ method: "POST", url: "/api/auth/register", headers: { host: HOST, origin: ORIGIN }, payload: { inviteId: bootstrap.rawInviteId, email: "owner@example.com", name: "Owner", timeZone: "UTC", password: "a sufficiently long passphrase" } });
    expect(registered.statusCode, registered.body).toBe(201);
    const cookie = String(registered.headers["set-cookie"]).split(";")[0]!;
    return { app, cookie };
  }

  it("reads and writes the digest preference for the signed-in user", async () => {
    const { app, cookie } = await setupAuthed();
    const initial = await app.inject({ method: "GET", url: "/api/email/preferences", headers: { host: HOST, cookie } });
    expect(initial.statusCode).toBe(200);
    expect(initial.json()).toEqual({ digestUnsubscribed: false });
    const unsub = await app.inject({ method: "POST", url: "/api/email/preferences", headers: { host: HOST, origin: ORIGIN, cookie }, payload: { digestUnsubscribed: true } });
    expect(unsub.statusCode).toBe(200);
    expect(unsub.json()).toEqual({ digestUnsubscribed: true });
    const reread = await app.inject({ method: "GET", url: "/api/email/preferences", headers: { host: HOST, cookie } });
    expect(reread.json()).toEqual({ digestUnsubscribed: true });
    const resub = await app.inject({ method: "POST", url: "/api/email/preferences", headers: { host: HOST, origin: ORIGIN, cookie }, payload: { digestUnsubscribed: false } });
    expect(resub.json()).toEqual({ digestUnsubscribed: false });
    await app.close();
  });

  it("requires a session and a valid body", async () => {
    const { app, cookie } = await setupAuthed();
    const anonymousGet = await app.inject({ method: "GET", url: "/api/email/preferences", headers: { host: HOST } });
    expect(anonymousGet.statusCode).toBe(401);
    const anonymousPost = await app.inject({ method: "POST", url: "/api/email/preferences", headers: { host: HOST, origin: ORIGIN }, payload: { digestUnsubscribed: true } });
    expect(anonymousPost.statusCode).toBe(401);
    const invalid = await app.inject({ method: "POST", url: "/api/email/preferences", headers: { host: HOST, origin: ORIGIN, cookie }, payload: {} });
    expect(invalid.statusCode).toBe(422);
    await app.close();
  });
});
