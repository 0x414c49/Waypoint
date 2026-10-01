import { chmod, mkdir, open, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { TotpSecretCipher } from "../domain/journey-state.js";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_STEP_MS = 30_000;

function encodeBase32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function decodeBase32(value: string): Buffer {
  const normalized = value.replace(/\s+/g, "").toUpperCase().replace(/=+$/g, "");
  if (!/^[A-Z2-7]{32}$/.test(normalized)) throw new Error("Invalid TOTP secret.");
  let bits = 0;
  let buffer = 0;
  const output: number[] = [];
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error("Invalid TOTP secret.");
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const bytes = Buffer.from(output);
  if (bytes.length !== 20) throw new Error("Invalid TOTP secret.");
  return bytes;
}

function codeForStep(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return value.toString().padStart(6, "0");
}

export function generateTotpSecret(): string {
  return encodeBase32(randomBytes(20));
}

export function totpCodeAt(secret: string, instant: Date): string {
  return codeForStep(secret, Math.floor(instant.valueOf() / TOTP_STEP_MS));
}

export function verifyTotpCode(secret: string, code: string, instant: Date, lastAcceptedStep?: number): number | undefined {
  if (!/^\d{6}$/.test(code)) return undefined;
  const supplied = Buffer.from(code);
  const currentStep = Math.floor(instant.valueOf() / TOTP_STEP_MS);
  for (const offset of [-1, 0, 1]) {
    const step = currentStep + offset;
    if (lastAcceptedStep !== undefined && step <= lastAcceptedStep) continue;
    const expected = Buffer.from(codeForStep(secret, step));
    if (timingSafeEqual(supplied, expected)) return step;
  }
  return undefined;
}

export function totpUri(email: string, secret: string): string {
  const label = encodeURIComponent(`Waypoint:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=Waypoint&algorithm=SHA1&digits=6&period=30`;
}

export function encryptTotpSecret(secret: string, key: Buffer, accountId: string): TotpSecretCipher {
  if (key.length !== 32) throw new Error("The TOTP encryption key must contain exactly 32 bytes.");
  decodeBase32(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(accountId, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return { algorithm: "aes-256-gcm", version: 1, iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") };
}

export function decryptTotpSecret(envelope: TotpSecretCipher, key: Buffer, accountId: string): string {
  if (key.length !== 32) throw new Error("The TOTP encryption key must contain exactly 32 bytes.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
  decipher.setAAD(Buffer.from(accountId, "utf8"));
  decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
  const secret = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]).toString("utf8");
  decodeBase32(secret);
  return secret;
}

export async function loadOrCreateTotpKey(path: string): Promise<Buffer> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  try {
    const handle = await open(path, "wx", 0o600);
    try {
      const key = randomBytes(32);
      await handle.writeFile(key);
      await handle.sync();
      return key;
    } finally {
      await handle.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  await chmod(path, 0o600);
  const key = await readFile(path);
  if (key.length !== 32) throw new Error(`The TOTP encryption key at ${path} is invalid.`);
  return key;
}
