// @vitest-environment node
import { describe, expect, it } from "vitest";
import { JsonJourneyStore } from "../adapters/json-store/index.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";
import { createNoHistorySeed } from "../domain/journey-state.js";
import { FixedClock } from "../ports/clock.js";
import { SequenceIdGenerator } from "../ports/id-generator.js";
import {
  EmailPreferenceService,
  issueDigestUnsubscribeToken,
  verifyDigestUnsubscribeToken,
} from "./preferences.js";

const KEY = Buffer.alloc(32, 7);
const OTHER_KEY = Buffer.alloc(32, 9);
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function service() {
  const root = await mkdtemp(join(tmpdir(), "email-prefs-test-")); roots.push(root);
  const clock = new FixedClock(new Date("2026-10-02T10:00:00.000Z"));
  const store = new JsonJourneyStore({ directory: join(root, "store"), clock, idGenerator: new SequenceIdGenerator(Array.from({ length: 50 }, (_, index) => `id-${index}`)), seed: createNoHistorySeed });
  await store.initialize();
  return new EmailPreferenceService({ store, clock, key: KEY });
}

describe("digest unsubscribe tokens", () => {
  it("round-trips and rejects tampering, wrong keys, and malformed tokens", () => {
    const token = issueDigestUnsubscribeToken("local-user", KEY);
    expect(verifyDigestUnsubscribeToken(token, KEY)).toBe("local-user");
    expect(verifyDigestUnsubscribeToken(`${token}x`, KEY)).toBeUndefined();
    expect(verifyDigestUnsubscribeToken(token, OTHER_KEY)).toBeUndefined();
    expect(verifyDigestUnsubscribeToken("no-separator", KEY)).toBeUndefined();
    expect(verifyDigestUnsubscribeToken("", KEY)).toBeUndefined();
  });

  it("unsubscribes idempotently and resubscribes", async () => {
    const prefs = await service();
    const token = issueDigestUnsubscribeToken("local-user", KEY);
    await expect(prefs.isDigestUnsubscribed("local-user")).resolves.toBe(false);
    await prefs.setDigestUnsubscribed(token, true);
    await expect(prefs.isDigestUnsubscribed("local-user")).resolves.toBe(true);
    await prefs.setDigestUnsubscribed(token, true);
    await expect(prefs.isDigestUnsubscribed("local-user")).resolves.toBe(true);
    await prefs.setDigestUnsubscribed(token, false);
    await expect(prefs.isDigestUnsubscribed("local-user")).resolves.toBe(false);
  });

  it("rejects forged tokens and unknown users with the same generic error", async () => {
    const prefs = await service();
    const forged = issueDigestUnsubscribeToken("local-user", OTHER_KEY);
    await expect(prefs.setDigestUnsubscribed(forged, true)).rejects.toMatchObject({ code: "UNSUBSCRIBE_INVALID", status: 404 });
    const ghost = issueDigestUnsubscribeToken("ghost-user", KEY);
    await expect(prefs.setDigestUnsubscribed(ghost, true)).rejects.toMatchObject({ code: "UNSUBSCRIBE_INVALID", status: 404 });
  });

  it("builds an absolute one-click URL for the digest template", async () => {
    const prefs = await service();
    const url = prefs.issueDigestUnsubscribeUrl("local-user", "https://waypoint.example.test/");
    expect(url.startsWith("https://waypoint.example.test/api/email/unsubscribe?token=")).toBe(true);
    const token = decodeURIComponent(url.split("token=")[1]!);
    await prefs.setDigestUnsubscribed(token, true);
    await expect(prefs.isDigestUnsubscribed("local-user")).resolves.toBe(true);
  });
});
