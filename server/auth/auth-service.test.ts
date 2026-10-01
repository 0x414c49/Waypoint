// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";
import { JsonJourneyStore } from "../adapters/json-store/index.js";
import { createNoHistorySeed } from "../domain/journey-state.js";
import { FixedClock } from "../ports/clock.js";
import { SequenceIdGenerator } from "../ports/id-generator.js";
import { AuthService, type PasswordHasher } from "./auth-service.js";
import { totpCodeAt } from "./totp.js";
import type { PasswordVerifier } from "../domain/journey-state.js";

class FastHasher implements PasswordHasher {
  async hash(password: string): Promise<PasswordVerifier> { return { algorithm: "scrypt", version: 1, N: 2, r: 1, p: 1, maxmem: 1, salt: `salt-${password}`.padEnd(22, "s"), derivedKey: `key-${password}`.padEnd(80, "k") }; }
  async verify(password: string, verifier: PasswordVerifier): Promise<boolean> { return verifier.derivedKey.startsWith(`key-${password}`); }
}

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("invite-gated authentication", () => {
  it("claims the legacy user atomically and rotates a server session", async () => {
    const root = await mkdtemp(join(tmpdir(), "auth-test-")); roots.push(root);
    const clock = new FixedClock(new Date("2026-09-30T10:00:00.000Z"));
    const ids = new SequenceIdGenerator(Array.from({ length: 30 }, (_, index) => `id-${index}`));
    const store = new JsonJourneyStore({ directory: join(root, "store"), clock, idGenerator: ids, seed: createNoHistorySeed });
    await store.initialize();
    const auth = new AuthService({ store, clock, idGenerator: ids, totpEncryptionKey: Buffer.alloc(32, 1), passwordHasher: new FastHasher() });
    const bootstrap = await auth.createBootstrapInvite("Owner@example.com");
    const enrollment = await auth.prepareTotpEnrollment(bootstrap.rawInviteId, "owner@example.com");
    const registration = await auth.register({ inviteId: bootstrap.rawInviteId, email: "owner@example.com", name: "Owner", timeZone: "Europe/Amsterdam", password: "a sufficiently long passphrase", totpSecret: enrollment.secret, totpCode: totpCodeAt(enrollment.secret, clock.now()) });
    expect(registration.user).toMatchObject({ id: "local-user", email: "owner@example.com", role: "OWNER" });
    expect(registration.token).not.toContain("owner@example.com");
    await expect(auth.authenticateToken(registration.token)).resolves.toMatchObject({ id: "local-user" });
    await auth.logout(registration.token);
    await expect(auth.authenticateToken(registration.token)).resolves.toBeUndefined();
  });

  it("rejects a reused invite and does not reveal missing accounts through a distinct failure", async () => {
    const root = await mkdtemp(join(tmpdir(), "auth-test-")); roots.push(root);
    const clock = new FixedClock(new Date("2026-09-30T10:00:00.000Z"));
    const ids = new SequenceIdGenerator(Array.from({ length: 30 }, (_, index) => `id-${index}`));
    const store = new JsonJourneyStore({ directory: join(root, "store"), clock, idGenerator: ids, seed: createNoHistorySeed }); await store.initialize();
    const auth = new AuthService({ store, clock, idGenerator: ids, totpEncryptionKey: Buffer.alloc(32, 1), passwordHasher: new FastHasher() });
    const invite = await auth.createBootstrapInvite("member@example.com", "MEMBER");
    const enrollment = await auth.prepareTotpEnrollment(invite.rawInviteId, "member@example.com");
    const totpCode = totpCodeAt(enrollment.secret, clock.now());
    await auth.register({ inviteId: invite.rawInviteId, email: "member@example.com", name: "Member", timeZone: "UTC", password: "a sufficiently long passphrase", totpSecret: enrollment.secret, totpCode });
    await expect(auth.register({ inviteId: invite.rawInviteId, email: "member@example.com", name: "Member", timeZone: "UTC", password: "a sufficiently long passphrase", totpSecret: enrollment.secret, totpCode })).rejects.toMatchObject({ code: "INVITE_INVALID" });
    await expect(auth.login("missing@example.com", "a sufficiently long passphrase", "000000")).rejects.toMatchObject({ status: 401, code: "AUTH_INVALID_CREDENTIALS" });
  });

  it("requires a fresh authenticator code at sign-in and never stores the raw secret", async () => {
    const root = await mkdtemp(join(tmpdir(), "auth-test-")); roots.push(root);
    let instant = new Date("2026-09-30T10:00:00.000Z");
    const clock = { now: () => new Date(instant) };
    const ids = new SequenceIdGenerator(Array.from({ length: 30 }, (_, index) => `id-${index}`));
    const store = new JsonJourneyStore({ directory: join(root, "store"), clock, idGenerator: ids, seed: createNoHistorySeed }); await store.initialize();
    const auth = new AuthService({ store, clock, idGenerator: ids, totpEncryptionKey: Buffer.alloc(32, 2), passwordHasher: new FastHasher() });
    const invite = await auth.createBootstrapInvite("owner@example.com");
    const enrollment = await auth.prepareTotpEnrollment(invite.rawInviteId, "owner@example.com");
    await auth.register({ inviteId: invite.rawInviteId, email: "owner@example.com", name: "Owner", timeZone: "UTC", password: "a sufficiently long passphrase", totpSecret: enrollment.secret, totpCode: totpCodeAt(enrollment.secret, instant) });
    expect(await store.read((state) => JSON.stringify(state.records.accounts))).not.toContain(enrollment.secret);

    instant = new Date(instant.valueOf() + 30_000);
    const nextCode = totpCodeAt(enrollment.secret, instant);
    await expect(auth.login("owner@example.com", "a sufficiently long passphrase", nextCode)).resolves.toMatchObject({ user: { email: "owner@example.com" } });
    await expect(auth.login("owner@example.com", "a sufficiently long passphrase", nextCode)).rejects.toMatchObject({ status: 401, code: "AUTH_INVALID_CREDENTIALS" });
    await expect(auth.login("owner@example.com", "wrong but long password", "000000")).rejects.toMatchObject({ status: 401, code: "AUTH_INVALID_CREDENTIALS" });
  });

  it("allows an invited account to opt out of two-factor authentication", async () => {
    const root = await mkdtemp(join(tmpdir(), "auth-test-")); roots.push(root);
    const clock = new FixedClock(new Date("2026-09-30T10:00:00.000Z"));
    const ids = new SequenceIdGenerator(Array.from({ length: 30 }, (_, index) => `id-${index}`));
    const store = new JsonJourneyStore({ directory: join(root, "store"), clock, idGenerator: ids, seed: createNoHistorySeed }); await store.initialize();
    const auth = new AuthService({ store, clock, idGenerator: ids, totpEncryptionKey: Buffer.alloc(32, 3), passwordHasher: new FastHasher() });
    const invite = await auth.createBootstrapInvite("owner@example.com");
    await auth.register({ inviteId: invite.rawInviteId, email: "owner@example.com", name: "Owner", timeZone: "UTC", password: "a sufficiently long passphrase" });

    await expect(auth.login("owner@example.com", "a sufficiently long passphrase")).resolves.toMatchObject({ user: { email: "owner@example.com" } });
    await expect(store.read((state) => Object.values(state.records.accounts ?? {})[0]?.totpSecretCipher)).resolves.toBeUndefined();
  });

  it("can revoke an unused bootstrap invite without affecting consumed invites", async () => {
    const root = await mkdtemp(join(tmpdir(), "auth-test-")); roots.push(root);
    const clock = new FixedClock(new Date("2026-09-30T10:00:00.000Z"));
    const ids = new SequenceIdGenerator(Array.from({ length: 30 }, (_, index) => `id-${index}`));
    const store = new JsonJourneyStore({ directory: join(root, "store"), clock, idGenerator: ids, seed: createNoHistorySeed }); await store.initialize();
    const auth = new AuthService({ store, clock, idGenerator: ids, totpEncryptionKey: Buffer.alloc(32, 1), passwordHasher: new FastHasher() });
    const invite = await auth.createBootstrapInvite("owner@example.com");
    const enrollment = await auth.prepareTotpEnrollment(invite.rawInviteId, "owner@example.com");

    await expect(auth.revokeBootstrapInvite(invite.rawInviteId)).resolves.toBe(true);
    await expect(auth.revokeBootstrapInvite(invite.rawInviteId)).resolves.toBe(false);
    await expect(auth.register({ inviteId: invite.rawInviteId, email: "owner@example.com", name: "Owner", timeZone: "UTC", password: "a sufficiently long passphrase", totpSecret: enrollment.secret, totpCode: totpCodeAt(enrollment.secret, clock.now()) })).rejects.toMatchObject({ code: "INVITE_INVALID" });
  });
});
