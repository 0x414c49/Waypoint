// @vitest-environment node
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { decryptTotpSecret, encryptTotpSecret, loadOrCreateTotpKey, totpCodeAt, verifyTotpCode } from "./totp.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("RFC 6238 authenticator codes", () => {
  const rfcSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

  it("matches the RFC SHA-1 vectors at six digits and permits one clock step of skew", () => {
    expect(totpCodeAt(rfcSecret, new Date(59_000))).toBe("287082");
    expect(totpCodeAt(rfcSecret, new Date(1_111_111_109_000))).toBe("081804");
    const code = totpCodeAt(rfcSecret, new Date(90_000));
    expect(verifyTotpCode(rfcSecret, code, new Date(120_000))).toBe(3);
  });

  it("rejects malformed and already accepted time steps", () => {
    const instant = new Date("2026-09-30T10:00:00.000Z");
    const code = totpCodeAt(rfcSecret, instant);
    const step = verifyTotpCode(rfcSecret, code, instant);
    expect(step).toBeTypeOf("number");
    expect(verifyTotpCode(rfcSecret, code, instant, step)).toBeUndefined();
    expect(verifyTotpCode(rfcSecret, "12345x", instant)).toBeUndefined();
  });

  it("encrypts the secret with authenticated account identity", () => {
    const key = Buffer.alloc(32, 7);
    const envelope = encryptTotpSecret(rfcSecret, key, "account-one");
    expect(JSON.stringify(envelope)).not.toContain(rfcSecret);
    expect(decryptTotpSecret(envelope, key, "account-one")).toBe(rfcSecret);
    expect(() => decryptTotpSecret(envelope, key, "account-two")).toThrow();
  });

  it("creates and reuses a private 256-bit installation key", async () => {
    const root = await mkdtemp(join(tmpdir(), "totp-key-test-")); roots.push(root);
    const path = join(root, "store", "auth.key");
    const first = await loadOrCreateTotpKey(path);
    const second = await loadOrCreateTotpKey(path);
    expect(first).toEqual(second);
    expect((await readFile(path)).length).toBe(32);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });
});
