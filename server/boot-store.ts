// Boot store selection (ADR-0014 auto-migration consequences).
//
//   - waypoint.db exists → open SQLite, verify, serve.
//   - waypoint.db missing + journey-state.json exists → one-time import first.
//   - neither exists → fresh SQLite init with the production seed.
//
// An existing waypoint.db is always preserved on verification failure. A
// failed import removes its own incomplete files; any file left at boot may
// contain authoritative writes newer than the leftover JSON source.

import { resolve } from "node:path";
import { SqliteJourneyStore } from "./adapters/sqlite-store/index.js";
import {
  importJsonDirectory,
  resolveBootMode,
  type BootMode,
  type ImportCounts,
} from "./adapters/sqlite-store/import-json.js";
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
    store.close();
    throw error;
  }
}
