import {
  type JourneyState,
  validateJourneyState,
} from "../domain/journey-state.js";
import { StoreError } from "./store-errors.js";

export function clone<T>(value: T): T {
  return structuredClone(value);
}

export function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function sortForJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortForJson(child)]),
    );
  }
  return value;
}

export function equalJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(sortForJson(left)) === JSON.stringify(sortForJson(right));
}

export function serializeJourneyState(state: JourneyState): string {
  return `${JSON.stringify(sortForJson(state), null, 2)}\n`;
}

export function parseJson(contents: string, label: string): unknown {
  try {
    return JSON.parse(contents) as unknown;
  } catch (error) {
    throw new StoreError("STORE_CORRUPT", `${label} is not valid JSON.`, error);
  }
}

export function assertValidState(value: unknown): asserts value is JourneyState {
  if (
    value !== null &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    (value as { schemaVersion?: unknown }).schemaVersion !== 1
  ) {
    throw new StoreError(
      "STORE_SCHEMA_UNSUPPORTED",
      "The store uses an unsupported schema version. Preserve it and upgrade the app.",
    );
  }
  const errors = validateJourneyState(value);
  if (errors.length > 0) {
    throw new StoreError("STORE_CORRUPT", `Store validation failed: ${errors.join("; ")}`);
  }
}
