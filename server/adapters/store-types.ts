export interface StoreDiagnostics {
  readonly initialized: boolean;
  readonly storeId: string;
  readonly durability: "full" | "reduced";
  readonly cleanedAbandonedTemps: readonly string[];
}

export interface StoreMarker {
  readonly storeId: string;
  readonly createdAt: string;
}
