// Per-user email preferences: digest opt-out behind unguessable confirmation links.
// Tokens are HMAC-SHA256(userId) under the 32-byte installation key (the same
// file as the TOTP key, domain-separated by a fixed context string so the two
// uses never collide). No session or login is needed to open the link, which is
// exactly what email clients require; the 256-bit MAC makes the link itself
// the credential. Future digest sending must consult isDigestUnsubscribed().

import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "../application/app-error.js";
import type { Clock } from "../ports/clock.js";
import type { JourneyStore } from "../ports/journey-store.js";

const TOKEN_CONTEXT = "email-unsubscribe-v1:digest:";
const USER_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const MAC_PATTERN = /^[a-f0-9]{64}$/;

function mac(key: Buffer, userId: string): Buffer {
  return createHmac("sha256", key).update(`${TOKEN_CONTEXT}${userId}`, "utf8").digest();
}

export function issueDigestUnsubscribeToken(userId: string, key: Buffer): string {
  if (!USER_ID_PATTERN.test(userId)) throw new AppError(422, "VALIDATION_FAILED", "The request is not valid", "Correct the request values and try again.");
  return `${userId}.${mac(key, userId).toString("hex")}`;
}

export function verifyDigestUnsubscribeToken(token: string, key: Buffer): string | undefined {
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return undefined;
  const userId = token.slice(0, separator);
  const presented = token.slice(separator + 1);
  if (!USER_ID_PATTERN.test(userId) || !MAC_PATTERN.test(presented)) return undefined;
  const expected = mac(key, userId);
  const candidate = Buffer.from(presented, "hex");
  if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) return undefined;
  return userId;
}

function invalidLink(): AppError {
  return new AppError(404, "UNSUBSCRIBE_INVALID", "That link is not valid", "The link may be mistyped or belong to a removed account.");
}

export class EmailPreferenceService {
  constructor(private readonly options: { store: JourneyStore; clock: Clock; key: Buffer }) {
    if (options.key.length !== 32) throw new Error("The email preference key must contain exactly 32 bytes.");
  }

  issueDigestUnsubscribeUrl(userId: string, baseUrl: string): string {
    const token = issueDigestUnsubscribeToken(userId, this.options.key);
    return `${baseUrl.replace(/\/$/, "")}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
  }

  async validateDigestLink(token: string): Promise<void> {
    const userId = verifyDigestUnsubscribeToken(token, this.options.key);
    if (!userId || !(await this.options.store.read((state) => Boolean(state.records.users[userId])))) throw invalidLink();
  }

  async setDigestUnsubscribed(token: string, unsubscribed: boolean): Promise<void> {
    const userId = verifyDigestUnsubscribeToken(token, this.options.key);
    if (!userId) throw invalidLink();
    const now = this.options.clock.now().toISOString();
    await this.options.store.transact({ kind: "STANDARD" }, (draft) => {
      if (!draft.records.users[userId]) throw invalidLink();
      draft.records.emailPreferences ??= {};
      const existing = draft.records.emailPreferences[userId];
      if (unsubscribed) {
        if (existing?.digestUnsubscribedAt) return { kind: "no-change", value: undefined };
        draft.records.emailPreferences[userId] = { id: userId, userId, digestUnsubscribedAt: now, updatedAt: now };
      } else if (!existing?.digestUnsubscribedAt) {
        return { kind: "no-change", value: undefined };
      } else {
        draft.records.emailPreferences[userId] = { id: userId, userId, updatedAt: now };
      }
      return { kind: "changed", value: undefined };
    });
  }

  async isDigestUnsubscribed(userId: string): Promise<boolean> {
    return this.options.store.read(
      (state) => Boolean(state.records.emailPreferences?.[userId]?.digestUnsubscribedAt),
    );
  }

  async setDigestUnsubscribedByUser(userId: string, unsubscribed: boolean): Promise<void> {
    const now = this.options.clock.now().toISOString();
    await this.options.store.transact({ kind: "STANDARD" }, (draft) => {
      if (!draft.records.users[userId]) throw new AppError(404, "ACCOUNT_NOT_FOUND", "Account not found", "Sign in again and try once more.");
      draft.records.emailPreferences ??= {};
      const existing = draft.records.emailPreferences[userId];
      if (unsubscribed) {
        if (existing?.digestUnsubscribedAt) return { kind: "no-change", value: undefined };
        draft.records.emailPreferences[userId] = { id: userId, userId, digestUnsubscribedAt: now, updatedAt: now };
      } else if (!existing?.digestUnsubscribedAt) {
        return { kind: "no-change", value: undefined };
      } else {
        draft.records.emailPreferences[userId] = { id: userId, userId, updatedAt: now };
      }
      return { kind: "changed", value: undefined };
    });
  }
}
