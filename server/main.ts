import { resolve } from "node:path";
import { JsonJourneyStore, StoreError } from "./adapters/json-store/index.js";
import { AuthenticatedCurrentUserProvider } from "./adapters/authenticated-current-user-provider.js";
import { AuthService } from "./auth/auth-service.js";
import { loadOrCreateTotpKey } from "./auth/totp.js";
import { createMailer } from "./email/mailer.js";
import { EmailPreferenceService } from "./email/preferences.js";
import { reconcileLegacyMedia } from "./http/media-routes.js";
import { createProductionSeed } from "./domain/production-seed.js";
import { buildApp } from "./http/build-app.js";
import { createStructuredLogger } from "./infrastructure/structured-logger.js";
import { SystemClock, type Clock } from "./ports/clock.js";
import { RandomIdGenerator } from "./ports/id-generator.js";
import { parseRuntimeConfig } from "./runtime-config.js";

async function start(): Promise<void> {
  const config = parseRuntimeConfig();
  const fixedNow = process.env.JOURNEY_ENV === "test" ? process.env.JOURNEY_FIXED_NOW : undefined;
  let testInstant = fixedNow ? Date.parse(fixedNow) : 0;
  const clock: Clock = fixedNow
    ? {
        now() {
          const result = new Date(testInstant);
          testInstant += 1_000;
          return result;
        },
      }
    : new SystemClock();
  if (Number.isNaN(clock.now().valueOf())) throw new Error("JOURNEY_FIXED_NOW must be an ISO instant.");
  const idGenerator = new RandomIdGenerator();
  const logger = createStructuredLogger(process.env.LOG_LEVEL ?? "info");
  const directory = config.storeDirectory;
  const store = new JsonJourneyStore({
    directory,
    clock,
    idGenerator,
    seed: createProductionSeed,
  });

  try {
    const diagnostics = await store.initialize();
    await reconcileLegacyMedia(resolve(directory, "media"), store, clock.now().toISOString());
    logger.info(
      {
        storeId: diagnostics.storeId,
        initialized: diagnostics.initialized,
        durability: diagnostics.durability,
        cleanedAbandonedTempCount: diagnostics.cleanedAbandonedTemps.length,
      },
      "Local store ready",
    );

    const currentUserProvider = new AuthenticatedCurrentUserProvider(store);
    const totpEncryptionKey = await loadOrCreateTotpKey(resolve(directory, "auth.key"));
    const authService = new AuthService({ store, clock, idGenerator, totpEncryptionKey, secureCookies: config.secureCookies });
    const mailer = createMailer({ apiKey: config.resendApiKey, from: config.emailFrom });
    if ((config.resendApiKey && !config.emailFrom) || (!config.resendApiKey && config.emailFrom)) {
      logger.warn("Email is half-configured: set both JOURNEY_RESEND_API_KEY and JOURNEY_EMAIL_FROM to enable invite emails.");
    }
    const emailPreferences = new EmailPreferenceService({ store, clock, key: totpEncryptionKey });
    const app = await buildApp({
      store,
      currentUserProvider,
      idGenerator,
      clock,
      logger,
      allowedHosts: config.allowedHosts,
      allowedMutationOrigins: config.allowedMutationOrigins,
      serveFrontend: config.serveFrontend,
      mediaDirectory: config.mediaDirectory,
      authService,
      mailer,
      publicUrl: config.publicUrl,
      emailPreferences,
    });
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    if (error instanceof StoreError) {
      logger.fatal(
        { code: error.code },
        `${error.message} Stop the server, preserve every file in ${directory}, and validate recovery artifacts before any explicit restore.`,
      );
    } else {
      logger.fatal({ err: error }, "Startup failed before the local server could listen");
    }
    process.exitCode = 1;
  }
}

await start();
