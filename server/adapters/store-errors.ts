export type StoreErrorCode =
  | "RECOVERY_REQUIRED"
  | "STORE_CORRUPT"
  | "STORE_SCHEMA_UNSUPPORTED"
  | "STORE_BUSY"
  | "STORE_WRITE_FAILED"
  | "STORE_DURABILITY_UNCERTAIN";

export class StoreError extends Error {
  constructor(
    readonly code: StoreErrorCode,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "StoreError";
  }
}
