// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteJourneyStore } from "../adapters/sqlite-store/index.js";
import { AuthenticatedCurrentUserProvider } from "../adapters/authenticated-current-user-provider.js";
import { createNoHistorySeed } from "../domain/journey-state.js";
import { createStructuredLogger } from "../infrastructure/structured-logger.js";
import { FixedClock } from "../ports/clock.js";
import { SequenceIdGenerator } from "../ports/id-generator.js";
import { AuthService, type PasswordHasher } from "../auth/auth-service.js";
import { totpCodeAt } from "../auth/totp.js";
import type { PasswordVerifier } from "../domain/journey-state.js";
import { buildApp } from "./build-app.js";

class FastHasher implements PasswordHasher {
  async hash(password: string): Promise<PasswordVerifier> { return { algorithm: "scrypt", version: 1, N: 2, r: 1, p: 1, maxmem: 1, salt: "s".repeat(22), derivedKey: `key:${password}`.padEnd(80, "k") }; }
  async verify(password: string, verifier: PasswordVerifier): Promise<boolean> { return verifier.derivedKey.startsWith(`key:${password}`); }
}

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("authenticated HTTP boundary", () => {
  it("denies private routes, allows owner invite administration, and denies members", async () => {
    const root = await mkdtemp(join(tmpdir(), "auth-http-test-")); roots.push(root);
    const clock = new FixedClock(new Date("2026-09-30T10:00:00.000Z"));
    const ids = new SequenceIdGenerator(Array.from({ length: 200 }, (_, index) => `id-${index}`));
    const store = new SqliteJourneyStore({ directory: join(root, "store"), clock, idGenerator: ids, seed: createNoHistorySeed }); await store.initialize();
    const provider = new AuthenticatedCurrentUserProvider(store);
    const auth = new AuthService({ store, clock, idGenerator: ids, totpEncryptionKey: Buffer.alloc(32, 1), passwordHasher: new FastHasher() });
    const app = await buildApp({ store, currentUserProvider: provider, idGenerator: ids, clock, logger: createStructuredLogger("silent"), allowedHosts: new Set(["127.0.0.1:4173"]), allowedMutationOrigins: new Set(["http://127.0.0.1:4173"]), authService: auth });
    const unauthorized = await app.inject({ method: "GET", url: "/api/quarters", headers: { host: "127.0.0.1:4173" } });
    expect(unauthorized.statusCode).toBe(401);
    const bootstrap = await auth.createBootstrapInvite("owner@example.com");
    const ownerSetup = await app.inject({ method: "POST", url: "/api/auth/totp/setup", headers: { host: "127.0.0.1:4173", origin: "http://127.0.0.1:4173" }, payload: { inviteId: bootstrap.rawInviteId, email: "owner@example.com" } });
    expect(ownerSetup.statusCode, ownerSetup.body).toBe(200);
    expect(ownerSetup.json().qrDataUrl).toMatch(/^data:image\/png;base64,/);
    const ownerSecret = ownerSetup.json().secret as string;
    const registered = await app.inject({ method: "POST", url: "/api/auth/register", headers: { host: "127.0.0.1:4173", origin: "http://127.0.0.1:4173" }, payload: { inviteId: bootstrap.rawInviteId, email: "owner@example.com", name: "Owner", timeZone: "UTC", password: "a sufficiently long passphrase", totpSecret: ownerSecret, totpCode: totpCodeAt(ownerSecret, clock.now()) } });
    expect(registered.statusCode).toBe(201);
    expect(registered.headers["set-cookie"]).toBeTruthy();
    const ownerCookie = String(registered.headers["set-cookie"]).split(";")[0]!;
    expect(ownerCookie).toMatch(/^waypoint_session=/);
    expect(await auth.authenticateToken(ownerCookie.slice("waypoint_session=".length))).toBeTruthy();
    const invite = await app.inject({ method: "POST", url: "/api/auth/invites", headers: { host: "127.0.0.1:4173", origin: "http://127.0.0.1:4173", cookie: ownerCookie }, payload: { email: "member@example.com" } });
    expect(invite.statusCode, `${ownerCookie} ${invite.body}`).toBe(201);
    const member = await app.inject({ method: "POST", url: "/api/auth/register", headers: { host: "127.0.0.1:4173", origin: "http://127.0.0.1:4173" }, payload: { inviteId: invite.json().inviteId, email: "member@example.com", name: "Member", timeZone: "UTC", password: "a sufficiently long passphrase" } });
    expect(member.statusCode).toBe(201);
    const memberCookie = String(member.headers["set-cookie"]).split(";")[0]!;
    const forbidden = await app.inject({ method: "POST", url: "/api/auth/invites", headers: { host: "127.0.0.1:4173", origin: "http://127.0.0.1:4173", cookie: memberCookie }, payload: { email: "other@example.com" } });
    expect(forbidden.statusCode).toBe(403);

    const ownerDecision = await app.inject({
      method: "POST",
      url: "/api/decisions",
      headers: { host: "127.0.0.1:4173", origin: "http://127.0.0.1:4173", cookie: ownerCookie, "idempotency-key": "owner-private-decision" },
      payload: { title: "Only the owner can read this" },
    });
    expect(ownerDecision.statusCode, ownerDecision.body).toBe(201);
    const hiddenFromMember = await app.inject({
      method: "GET",
      url: `/api/decisions/${ownerDecision.json().id}`,
      headers: { host: "127.0.0.1:4173", cookie: memberCookie },
    });
    expect(hiddenFromMember.statusCode).toBe(404);
    const memberList = await app.inject({ method: "GET", url: "/api/decisions", headers: { host: "127.0.0.1:4173", cookie: memberCookie } });
    expect(memberList.statusCode).toBe(200);
    expect(memberList.json().items).toEqual([]);
    await app.close();
  });
});
