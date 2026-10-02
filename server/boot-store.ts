// Boot store selection (ADR-0014 auto-migration consequences).
//
//   - waypoint.db exists → open SQLite, verify, serve.
//   - waypoint.db missing + journey-state.json exists → one-time import first.
//   - neither exists → fresh SQLite init with the production seed.
//
// A partial waypoint.db (crash mid-migration: integrity/meta check fails with
// STORE_CORRUPT or STORE_SCHEMA_UNSUPPORTED) is deleted and the boot retries
// from the untouched JSON in the same startup — the equivalent of the
// "retry on next boot" rule without requiring an operator restart. The JSON
// source and the pre-sqlite backup are never touched by this path. Marker
// problems (RECOVERY_REQUIRED) always fail closed: the database may belong to
// another store, so it is never deleted here.

import { rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { SqliteJourneyStore } from "./adapters/sqlite-store/index.js";
import {
  importJsonDirectory,
  resolveBootMode,
  type BootMode,
  type ImportCounts,
} from "./adapters/sqlite-store/import-json.js";
import { StoreError } from "./adapters/store-errors.js";
import type { StoreDiagnostics } from "./adapters/store-types.js";
import type { JourneyState } from "./domain/journey-state.js";
import type { Clock } from "./ports/clock.js";
import type { IdGenerator } from "./ports/id-generator.js";

export interface BootStoreDependencies {
  readonly directory: string;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly seed: (writtenAt: string) => JourneyState;
  readonly log?: (message: string, fields?: Record<string, unknown>) => void;
}

export interface BootStoreResult {
  readonly store: SqliteJourneyStore;
  readonly mode: BootMode;
  readonly diagnostics: StoreDiagnostics;
  readonly backupPath: string | undefined;
  readonly orphansPath: string | undefined;
  readonly counts: ImportCounts | undefined;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function bootJourneyStore(dependencies: BootStoreDependencies): Promise<BootStoreResult> {
  const directory = resolve(dependencies.directory);
  const open = (): SqliteJourneyStore =>
    new SqliteJourneyStore({
      directory,
      clock: dependencies.clock,
      idGenerator: dependencies.idGenerator,
      seed: dependencies.seed,
    });
  const mode = await resolveBootMode(directory);

  if (mode === "migrate" || mode === "fresh") {
    if (mode === "fresh") {
      const store = open();
      const diagnostics = await store.initialize();
      dependencies.log?.("Local store initialized fresh", { storeId: diagnostics.storeId });
      return { store, mode, diagnostics, backupPath: undefined, orphansPath: undefined, counts: undefined };
    }
    const summary = await importJsonDirectory({
      directory,
      clock: dependencies.clock,
      idGenerator: dependencies.idGenerator,
    });
    dependencies.log?.("JSON → SQLite migration completed", {
      backupPath: summary.backupPath,
      orphansPath: summary.orphansPath,
      storeRevision: summary.counts.storeRevision,
      receipts: summary.counts.receipts,
    });
    return {
      store: summary.store,
      mode,
      diagnostics: summary.diagnostics,
      backupPath: summary.backupPath,
      orphansPath: summary.orphansPath,
      counts: summary.counts,
    };
  }

  const store = open();
  try {
    const diagnostics = await store.initialize();
    dependencies.log?.("SQLite store ready; leftover JSON (if any) is ignored", { storeId: diagnostics.storeId });
    return { store, mode, diagnostics, backupPath: undefined, orphansPath: undefined, counts: undefined };
  } catch (error) {
    const retryable =
      error instanceof StoreError && (error.code === "STORE_CORRUPT" || error.code === "STORE_SCHEMA_UNSUPPORTED");
    if (!retryable || !(await exists(join(directory, "journey-state.json")))) {
      store.close();
      throw error;
    }
    // Partial database from a crashed migration: remove it and migrate from
    // the untouched JSON source in this same boot.
    dependencies.log?.("Partial SQLite database found; re-importing from untouched JSON", { code: error.code });
    store.close();
    const dbPath = join(directory, "waypoint.db");
    await rm(dbPath, { force: true });
    await rm(`${dbPath}-wal`, { force: true });
    await rm(`${dbPath}-shm`, { force: true });
    const summary = await importJsonDirectory({
      directory,
      clock: dependencies.clock,
      idGenerator: dependencies.idGenerator,
    });
    dependencies.log?.("JSON → SQLite migration completed after partial cleanup", {
      backupPath: summary.backupPath,
      storeRevision: summary.counts.storeRevision,
    });
    return {
      store: summary.store,
      mode: "migrate",
      diagnostics: summary.diagnostics,
      backupPath: summary.backupPath,
      orphansPath: summary.orphansPath,
      counts: summary.counts,
    };
  }
}
