import { createHash, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { AppError } from "../application/app-error.js";
import type { AuthenticatedCurrentUser } from "../adapters/authenticated-current-user-provider.js";
import type { AuthRole, AuthInviteRecord, PasswordVerifier, AccountRecord, JourneyState } from "../domain/journey-state.js";
import type { Clock } from "../ports/clock.js";
import type { IdGenerator } from "../ports/id-generator.js";
import type { JourneyStore } from "../ports/journey-store.js";
import { decryptTotpSecret, encryptTotpSecret, generateTotpSecret, totpUri, verifyTotpCode } from "./totp.js";

function scryptAsync(password: string, salt: Buffer, keyLength: number, options: { N: number; r: number; p: number; maxmem: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => nodeScrypt(password, salt, keyLength, options, (error, result) => error ? reject(error) : resolve(result as Buffer)));
}
const PASSWORD_N = 2 ** 17;
const PASSWORD_R = 8;
const PASSWORD_P = 1;
const PASSWORD_MAXMEM = 256 * 1024 * 1024;
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const commonPasswords = new Set(["password", "password123", "123456789012345", "qwertyuiopasdfg", "letmein123456789", "waypointpassword"]);

export interface PasswordHasher {
  hash(password: string): Promise<PasswordVerifier>;
  verify(password: string, verifier: PasswordVerifier): Promise<boolean>;
}

export class ScryptPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<PasswordVerifier> {
    const salt = randomBytes(16);
    const key = await scryptAsync(password, salt, 64, { N: PASSWORD_N, r: PASSWORD_R, p: PASSWORD_P, maxmem: PASSWORD_MAXMEM });
    return { algorithm: "scrypt", version: 1, N: PASSWORD_N, r: PASSWORD_R, p: PASSWORD_P, maxmem: PASSWORD_MAXMEM, salt: salt.toString("base64"), derivedKey: key.toString("base64") };
  }

  async verify(password: string, verifier: PasswordVerifier): Promise<boolean> {
    const salt = Buffer.from(verifier.salt, "base64");
    const expected = Buffer.from(verifier.derivedKey, "base64");
    const key = await scryptAsync(password, salt, expected.length, { N: verifier.N, r: verifier.r, p: verifier.p, maxmem: verifier.maxmem });
    return key.length === expected.length && timingSafeEqual(key, expected);
  }
}

export function normalizeEmail(value: string): string {
  return value.normalize("NFC").trim().toLowerCase();
}

function normalizePassword(value: string): string {
  return value.normalize("NFC");
}

export function assertPasswordPolicy(value: string): string {
  const password = normalizePassword(value);
  const length = Array.from(password).length;
  if (length < 15 || length > 128 || commonPasswords.has(password.toLowerCase())) {
    throw new AppError(422, "VALIDATION_FAILED", "The password is not valid", "Use a unique passphrase with 15–128 characters.");
  }
  return password;
}

export function assertTimeZone(value: string): string {
  try { Intl.DateTimeFormat("en-US", { timeZone: value }).format(); } catch { throw new AppError(422, "VALIDATION_FAILED", "The request is not valid", "Use a valid IANA time zone."); }
  return value;
}

function digest(raw: string): string { return createHash("sha256").update(raw).digest("hex"); }
function safeId(value: string): string { return value.toLowerCase().replace(/[^a-z0-9._-]/g, "-").slice(0, 120); }
function maps(state: JourneyState): { accounts: NonNullable<JourneyState["records"]["accounts"]>; invites: NonNullable<JourneyState["records"]["authInvites"]>; sessions: NonNullable<JourneyState["records"]["authSessions"]> } {
  state.records.accounts ??= {};
  state.records.authInvites ??= {};
  state.records.authSessions ??= {};
  return { accounts: state.records.accounts, invites: state.records.authInvites, sessions: state.records.authSessions };
}

function projection(state: JourneyState, account: AccountRecord): AuthenticatedCurrentUser {
  const user = state.records.users[account.userId];
  if (!user) throw new Error("The account refers to a missing validated user.");
  return { id: user.id, accountId: account.id, name: user.name, email: account.email, timeZone: user.timeZone, role: account.role, createdAt: user.createdAt };
}

export interface AuthInviteView { id: string; intendedEmail: string; role: AuthRole; bootstrap: boolean; createdAt: string; expiresAt: string; status: "pending" | "consumed" | "revoked" | "expired"; }

export class AuthService {
  readonly cookieName: string;
  private readonly dummyVerifier: PasswordVerifier;
  constructor(private readonly options: { store: JourneyStore; clock: Clock; idGenerator: IdGenerator; totpEncryptionKey: Buffer; passwordHasher?: PasswordHasher; secureCookies?: boolean }) {
    if (options.totpEncryptionKey.length !== 32) throw new Error("The TOTP encryption key must contain exactly 32 bytes.");
    this.cookieName = options.secureCookies ? "__Host-waypoint_session" : "waypoint_session";
    this.dummyVerifier = { algorithm: "scrypt", version: 1, N: PASSWORD_N, r: PASSWORD_R, p: PASSWORD_P, maxmem: PASSWORD_MAXMEM, salt: Buffer.alloc(16).toString("base64"), derivedKey: Buffer.alloc(64).toString("base64") };
  }
  private get hasher(): PasswordHasher { return this.options.passwordHasher ?? new ScryptPasswordHasher(); }

  async authenticateToken(raw: string | undefined): Promise<AuthenticatedCurrentUser | undefined> {
    if (!raw) return undefined;
    const id = digest(raw);
    const now = this.options.clock.now();
    const found = await this.options.store.read((state) => {
      const session = state.records.authSessions?.[id];
      if (!session || session.revokedAt || Date.parse(session.expiresAt) <= now.valueOf()) return undefined;
      const account = state.records.accounts?.[session.accountId];
      if (!account || account.disabledAt || account.userId !== session.userId || !state.records.users[session.userId]) return undefined;
      return { session, account, user: projection(state, account) };
    });
    if (!found) {
      await this.options.store.transact({ kind: "AUTHENTICATION" }, (draft) => {
        const session = draft.records.authSessions?.[id];
        const account = session ? draft.records.accounts?.[session.accountId] : undefined;
        if (!session || (!session.revokedAt && Date.parse(session.expiresAt) > now.valueOf() && !account?.disabledAt)) return { kind: "no-change", value: undefined };
        delete draft.records.authSessions![id];
        return { kind: "changed", value: undefined };
      });
      return undefined;
    }
    if (Date.parse(found.session.lastSeenAt) + 60_000 < now.valueOf()) {
      await this.options.store.transact({ kind: "AUTHENTICATION" }, (draft) => {
        const session = draft.records.authSessions?.[id];
        if (!session || session.revokedAt) return { kind: "no-change", value: undefined };
        session.lastSeenAt = now.toISOString();
        return { kind: "changed", value: undefined };
      });
    }
    return found.user;
  }

  async prepareTotpEnrollment(inviteId: string, emailInput: string): Promise<{ secret: string; uri: string }> {
    const email = normalizeEmail(emailInput);
    const inviteDigest = digest(inviteId);
    const now = this.options.clock.now();
    const valid = await this.options.store.read((state) => {
      const invite = state.records.authInvites?.[inviteDigest];
      return Boolean(invite && !invite.revokedAt && !invite.consumedAt && Date.parse(invite.expiresAt) > now.valueOf() && invite.intendedEmail === email);
    });
    if (!valid) throw new AppError(400, "INVITE_INVALID", "The invite is not valid", "Use a valid, unexpired invite for this email address.");
    const secret = generateTotpSecret();
    return { secret, uri: totpUri(email, secret) };
  }

  async register(input: { inviteId: string; email: string; name: string; timeZone: string; password: string; totpSecret?: string; totpCode?: string }): Promise<{ user: AuthenticatedCurrentUser; token: string }> {
    const email = normalizeEmail(input.email);
    const name = input.name.normalize("NFC").trim();
    const timeZone = assertTimeZone(input.timeZone);
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 320 || name.length < 1 || name.length > 120) throw new AppError(422, "VALIDATION_FAILED", "The request is not valid", "Correct the registration values and try again.");
    const password = assertPasswordPolicy(input.password);
    const totpSecret = input.totpSecret?.replace(/\s+/g, "").toUpperCase();
    let acceptedTotpStep: number | undefined;
    if (totpSecret || input.totpCode) {
      if (!totpSecret || !input.totpCode) throw new AppError(422, "TOTP_INVALID", "The authenticator setup is incomplete", "Set up the authenticator again or continue without it.");
      try { acceptedTotpStep = verifyTotpCode(totpSecret, input.totpCode, this.options.clock.now()); } catch { acceptedTotpStep = undefined; }
      if (acceptedTotpStep === undefined) throw new AppError(422, "TOTP_INVALID", "The authenticator code is not valid", "Enter the current six-digit code from the authenticator app.");
    }
    const inviteDigest = digest(input.inviteId);
    const verifier = await this.hasher.hash(password);
    const now = this.options.clock.now().toISOString();
    const token = randomBytes(32).toString("base64url");
    const sessionId = digest(token);
    const result = await this.options.store.transact({ kind: "AUTHENTICATION" }, (draft) => {
      const { accounts, invites, sessions } = maps(draft);
      const invite = invites[inviteDigest] as AuthInviteRecord | undefined;
      if (!invite || invite.revokedAt || invite.consumedAt || Date.parse(invite.expiresAt) <= Date.parse(now) || invite.intendedEmail !== email) throw new AppError(400, "INVITE_INVALID", "The invite is not valid", "Use a valid, unexpired invite for this email address.");
      const existingAccount = Object.values(accounts).find((account) => account.email === email && !account.disabledAt);
      if (existingAccount?.totpSecretCipher) throw new AppError(409, "REGISTRATION_UNAVAILABLE", "Registration is unavailable", "Use a different invite or contact the local owner.");
      const userId = existingAccount?.userId ?? invite.legacyUserId ?? safeId(this.options.idGenerator.generate());
      const accountId = existingAccount?.id ?? safeId(this.options.idGenerator.generate());
      if (!draft.records.users[userId]) draft.records.users[userId] = { id: userId, name, timeZone, createdAt: now };
      else { draft.records.users[userId].name = name; draft.records.users[userId].timeZone = timeZone; }
      const totpFields = totpSecret && acceptedTotpStep !== undefined
        ? { totpSecretCipher: encryptTotpSecret(totpSecret, this.options.totpEncryptionKey, accountId), lastTotpStep: acceptedTotpStep }
        : {};
      const account = { id: accountId, userId, email, role: existingAccount?.role ?? invite.role, passwordVerifier: verifier, ...totpFields, createdAt: existingAccount?.createdAt ?? now, updatedAt: now };
      accounts[accountId] = account;
      invite.consumedAt = now; invite.consumedByUserId = userId;
      sessions[sessionId] = { id: sessionId, accountId, userId, createdAt: now, lastSeenAt: now, expiresAt: new Date(Date.parse(now) + SESSION_LIFETIME_MS).toISOString() };
      return { kind: "changed", value: { user: projection(draft, account), token } };
    });
    return result.value;
  }

  async login(emailInput: string, passwordInput: string, totpCode?: string): Promise<{ user: AuthenticatedCurrentUser; token: string }> {
    const email = normalizeEmail(emailInput);
    const password = normalizePassword(passwordInput);
    const account = await this.options.store.read((state) => Object.values(state.records.accounts ?? {}).find((candidate) => candidate.email === email && !candidate.disabledAt));
    const valid = await this.hasher.verify(password, account?.passwordVerifier ?? this.dummyVerifier);
    if (!account || !valid) throw new AppError(401, "AUTH_INVALID_CREDENTIALS", "Sign-in failed", "The email, password, or authenticator code is not correct.");
    if (account.totpSecretCipher && !totpCode) throw new AppError(401, "TOTP_REQUIRED", "Authenticator code required", "Enter the current six-digit code from the authenticator app.");
    let acceptedTotpStep: number | undefined;
    if (account.totpSecretCipher && totpCode) {
      try {
        const secret = decryptTotpSecret(account.totpSecretCipher, this.options.totpEncryptionKey, account.id);
        acceptedTotpStep = verifyTotpCode(secret, totpCode, this.options.clock.now(), account.lastTotpStep);
      } catch { acceptedTotpStep = undefined; }
    }
    if (account.totpSecretCipher && acceptedTotpStep === undefined) throw new AppError(401, "AUTH_INVALID_CREDENTIALS", "Sign-in failed", "The email, password, or authenticator code is not correct.");
    const now = this.options.clock.now().toISOString();
    const token = randomBytes(32).toString("base64url");
    const sessionId = digest(token);
    const result = await this.options.store.transact({ kind: "AUTHENTICATION" }, (draft) => {
      const { sessions } = maps(draft);
      const current = draft.records.accounts?.[account.id];
      if (!current || current.disabledAt) throw new AppError(401, "AUTH_INVALID_CREDENTIALS", "Sign-in failed", "The email, password, or authenticator code is not correct.");
      if (current.totpSecretCipher) {
        if (acceptedTotpStep === undefined || (current.lastTotpStep !== undefined && current.lastTotpStep >= acceptedTotpStep)) throw new AppError(401, "AUTH_INVALID_CREDENTIALS", "Sign-in failed", "The email, password, or authenticator code is not correct.");
        current.lastTotpStep = acceptedTotpStep;
      }
      sessions[sessionId] = { id: sessionId, accountId: account.id, userId: account.userId, createdAt: now, lastSeenAt: now, expiresAt: new Date(Date.parse(now) + SESSION_LIFETIME_MS).toISOString() };
      return { kind: "changed", value: { user: projection(draft, current), token } };
    });
    return result.value;
  }

  async logout(raw: string | undefined): Promise<void> {
    if (!raw) return;
    const id = digest(raw);
    await this.options.store.transact({ kind: "AUTHENTICATION" }, (draft) => {
      const session = draft.records.authSessions?.[id];
      if (!session || session.revokedAt) return { kind: "no-change", value: undefined };
      session.revokedAt = this.options.clock.now().toISOString();
      return { kind: "changed", value: undefined };
    });
  }

  async createInvite(owner: AuthenticatedCurrentUser, intendedEmailInput: string): Promise<{ rawInviteId: string; invite: AuthInviteView }> {
    const email = normalizeEmail(intendedEmailInput);
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 320) throw new AppError(422, "VALIDATION_FAILED", "The email is not valid", "Use a valid email address.");
    const rawInviteId = `wp_inv_${randomBytes(32).toString("base64url")}`;
    const id = digest(rawInviteId); const now = this.options.clock.now().toISOString(); const expiresAt = new Date(Date.parse(now) + INVITE_LIFETIME_MS).toISOString();
    const record: AuthInviteRecord = { id, intendedEmail: email, role: "MEMBER", createdByUserId: owner.id, bootstrap: false, createdAt: now, expiresAt };
    await this.options.store.transact({ kind: "AUTHENTICATION" }, (draft) => { maps(draft).invites[id] = record; return { kind: "changed", value: undefined }; });
    return { rawInviteId, invite: this.inviteView(record, now) };
  }

  async createBootstrapInvite(emailInput: string, role: AuthRole = "OWNER"): Promise<{ rawInviteId: string; invite: AuthInviteView }> {
    const email = normalizeEmail(emailInput);
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 320) throw new AppError(422, "VALIDATION_FAILED", "The email is not valid", "Use a valid email address.");
    const rawInviteId = `wp_inv_${randomBytes(32).toString("base64url")}`; const id = digest(rawInviteId); const now = this.options.clock.now().toISOString(); const expiresAt = new Date(Date.parse(now) + INVITE_LIFETIME_MS).toISOString();
    const record: AuthInviteRecord = { id, intendedEmail: email, role, bootstrap: true, legacyUserId: "local-user", createdAt: now, expiresAt };
    await this.options.store.transact({ kind: "AUTHENTICATION" }, (draft) => { if (!draft.records.users["local-user"]) throw new AppError(409, "BOOTSTRAP_UNAVAILABLE", "Bootstrap is unavailable", "The canonical local user is missing."); const { invites } = maps(draft); for (const invite of Object.values(invites)) if (invite.bootstrap && !invite.consumedAt && !invite.revokedAt) invite.revokedAt = now; invites[id] = record; return { kind: "changed", value: undefined }; });
    return { rawInviteId, invite: this.inviteView(record, now) };
  }

  async revokeBootstrapInvite(rawInviteId: string): Promise<boolean> {
    const id = digest(rawInviteId);
    const now = this.options.clock.now().toISOString();
    const result = await this.options.store.transact({ kind: "AUTHENTICATION" }, (draft) => {
      const invite = draft.records.authInvites?.[id];
      if (!invite?.bootstrap || invite.consumedAt || invite.revokedAt) return { kind: "no-change", value: false };
      invite.revokedAt = now;
      return { kind: "changed", value: true };
    });
    return result.value;
  }

  async listInvites(now = this.options.clock.now().toISOString()): Promise<AuthInviteView[]> { return this.options.store.read((state) => Object.values(state.records.authInvites ?? {}).map((item) => this.inviteView(item, now)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))); }
  async revokeInvite(id: string): Promise<void> { await this.options.store.transact({ kind: "AUTHENTICATION" }, (draft) => { const invite = draft.records.authInvites?.[id]; if (!invite || invite.consumedAt) return { kind: "no-change", value: undefined }; invite.revokedAt = this.options.clock.now().toISOString(); return { kind: "changed", value: undefined }; }); }
  private inviteView(invite: AuthInviteRecord, now: string): AuthInviteView { const status = invite.revokedAt ? "revoked" : invite.consumedAt ? "consumed" : Date.parse(invite.expiresAt) <= Date.parse(now) ? "expired" : "pending"; return { id: invite.id, intendedEmail: invite.intendedEmail, role: invite.role, bootstrap: invite.bootstrap, createdAt: invite.createdAt, expiresAt: invite.expiresAt, status }; }
}

export function readCookie(request: FastifyRequest, name: string): string | undefined {
  const rawHeader = request.headers.cookie; if (!rawHeader) return undefined;
  const header = Array.isArray(rawHeader) ? rawHeader.join(";") : rawHeader;
  for (const item of header.split(";")) { const separator = item.indexOf("="); if (separator < 0) continue; const key = item.slice(0, separator).trim(); if (key === name) return decodeURIComponent(item.slice(separator + 1).trim()); }
  return undefined;
}

export function sessionCookie(name: string, token: string | null, secure: boolean): string {
  if (!token) return `${name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;
  return `${name}=${encodeURIComponent(token)}; Max-Age=${SESSION_LIFETIME_MS / 1000}; Path=/; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;
}
