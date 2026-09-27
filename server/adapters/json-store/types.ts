import type { JourneyState } from "../../domain/journey-state.js";
import type { Clock } from "../../ports/clock.js";
import type { IdGenerator } from "../../ports/id-generator.js";

export interface StoreDiagnostics {
  readonly initialized: boolean;
  readonly storeId: string;
  readonly durability: "full" | "reduced";
  readonly cleanedAbandonedTemps: readonly string[];
}

export type StoreFailpoint = "before-primary-rename" | "after-primary-rename";

export interface JsonJourneyStoreOptions {
  readonly directory: string;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly seed: (writtenAt: string) => JourneyState;
  readonly mutexTimeoutMs?: number;
  readonly failpoint?: (point: StoreFailpoint) => void;
}

export interface StoreMarker {
  readonly storeId: string;
  readonly createdAt: string;
}
