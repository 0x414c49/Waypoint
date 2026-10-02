import type { JourneyState } from "../domain/journey-state.js";
import type { SearchInput } from "../application/search/search.js";
import type { SearchResponseContract } from "../../shared/contracts/search.js";

export type TransactionIntent =
  | { readonly kind: "STANDARD" }
  | { readonly kind: "PLAN_APPLY" }
  | { readonly kind: "JOURNEY_DELETE"; readonly journeyEntryId: string }
  | { readonly kind: "AUTHENTICATION" }
  | {
      readonly kind: "SCHEMA_MIGRATION";
      readonly fromVersion: number;
      readonly toVersion: number;
    };

export const STANDARD_INTENT = Object.freeze({ kind: "STANDARD" } as const);

export type Mutation<T> =
  | { readonly kind: "changed"; readonly value: T }
  | { readonly kind: "no-change"; readonly value: T };

export interface TransactionResult<T> {
  readonly value: T;
  readonly state: JourneyState;
  readonly changed: boolean;
}

export interface JourneyStore {
  read<T>(project: (state: JourneyState) => T): Promise<T>;
  search?(userId: string, input: SearchInput): Promise<SearchResponseContract>;
  transact<T>(
    intent: TransactionIntent,
    mutate: (draft: JourneyState) => Mutation<T>,
  ): Promise<TransactionResult<T>>;
}
