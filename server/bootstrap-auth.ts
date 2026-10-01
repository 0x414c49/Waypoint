import { resolve } from "node:path";
import { JsonJourneyStore } from "./adapters/json-store/index.js";
import { createProductionSeed } from "./domain/production-seed.js";
import { AuthService, normalizeEmail } from "./auth/auth-service.js";
import { loadOrCreateTotpKey } from "./auth/totp.js";
import { SystemClock, type Clock } from "./ports/clock.js";
import { RandomIdGenerator } from "./ports/id-generator.js";

const args = process.argv.slice(2);
const get = (name: string): string | undefined => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const revokeInviteId = get("--revoke-invite");
const email = get("--email") ?? process.env.JOURNEY_BOOTSTRAP_EMAIL;
if (!email && !revokeInviteId) throw new Error("Supply --email person@example.com (or JOURNEY_BOOTSTRAP_EMAIL), or use --revoke-invite with the exact raw invite ID.");
const fixedNow = process.env.JOURNEY_FIXED_NOW;
const fixedInstant = fixedNow ? new Date(fixedNow) : undefined;
if (fixedInstant && Number.isNaN(fixedInstant.valueOf())) throw new Error("JOURNEY_FIXED_NOW must be an ISO instant.");
const clock: Clock = fixedInstant ? { now: () => new Date(fixedInstant) } : new SystemClock();
const idGenerator = new RandomIdGenerator();
const directory = resolve(process.cwd(), process.env.JOURNEY_STORE_DIR ?? "data/store");
const store = new JsonJourneyStore({ directory, clock, idGenerator, seed: createProductionSeed });
await store.initialize();
const totpEncryptionKey = await loadOrCreateTotpKey(resolve(directory, "auth.key"));
const auth = new AuthService({ store, clock, idGenerator, totpEncryptionKey });
if (revokeInviteId) {
  const revoked = await auth.revokeBootstrapInvite(revokeInviteId);
  console.log(revoked ? "Revoked the specified bootstrap invite." : "The specified pending bootstrap invite was not found.");
} else {
  const result = await auth.createBootstrapInvite(normalizeEmail(email!), "OWNER");
  console.log(`Bootstrap invite for ${result.invite.intendedEmail} (expires ${result.invite.expiresAt}):`);
  console.log(result.rawInviteId);
  console.log("Use this one-time ID at /register; it is not stored and cannot be recovered.");
}
