import { resolve } from "node:path";
import { JsonJourneyStore, StoreError } from "./adapters/json-store/index.js";
import { LocalCurrentUserProvider } from "./adapters/local-current-user-provider.js";
import { createProductionSeed } from "./domain/production-seed.js";
import { buildApp } from "./http/build-app.js";
import { createStructuredLogger } from "./infrastructure/structured-logger.js";
import { SystemClock, type Clock } from "./ports/clock.js";
import { RandomIdGenerator } from "./ports/id-generator.js";

async function start(): Promise<void> {
  const development = process.env.JOURNEY_ENV === "development";
  const port = development ? 4174 : 4173;
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
  const directory = resolve(process.cwd(), process.env.JOURNEY_STORE_DIR ?? "data/store");
  const store = new JsonJourneyStore({
    directory,
    clock,
    idGenerator,
    seed: createProductionSeed,
  });

  try {
    const diagnostics = await store.initialize();
    logger.info(
      {
        storeId: diagnostics.storeId,
        initialized: diagnostics.initialized,
        durability: diagnostics.durability,
        cleanedAbandonedTempCount: diagnostics.cleanedAbandonedTemps.length,
      },
      "Local store ready",
    );

    const hostPort = (value: string) => new Set([`127.0.0.1:${value}`, `localhost:${value}`]);
    const app = await buildApp({
      store,
      currentUserProvider: new LocalCurrentUserProvider(store),
      idGenerator,
      clock,
      logger,
      allowedHosts: development
        ? new Set([...hostPort("5173"), ...hostPort("4174")])
        : hostPort("4173"),
      allowedMutationOrigins: development
        ? new Set(["http://127.0.0.1:5173", "http://localhost:5173"])
        : new Set(["http://127.0.0.1:4173", "http://localhost:4173"]),
      serveFrontend: !development,
    });
    await app.listen({ host: "127.0.0.1", port });
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
