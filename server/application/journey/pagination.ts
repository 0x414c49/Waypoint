import { AppError } from "../app-error.js";

export function decodeOffsetCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const value = Number(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("invalid");
    return value;
  } catch {
    throw new AppError(422, "VALIDATION_FAILED", "The cursor is not valid", "Refresh the list and try again.");
  }
}

export function encodeOffsetCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

export interface TimelineCursor {
  occurredAt: string;
  id: string;
  orderKey?: string;
}

export function decodeTimelineCursor(cursor: string | undefined): TimelineCursor | null {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (
      typeof value !== "object" || value === null ||
      typeof (value as TimelineCursor).occurredAt !== "string" ||
      new Date((value as TimelineCursor).occurredAt).toISOString() !== (value as TimelineCursor).occurredAt ||
      typeof (value as TimelineCursor).id !== "string" || !(value as TimelineCursor).id ||
      ((value as TimelineCursor).orderKey !== undefined &&
        (typeof (value as TimelineCursor).orderKey !== "string" || !(value as TimelineCursor).orderKey))
    ) throw new Error("invalid");
    return value as TimelineCursor;
  } catch {
    throw new AppError(422, "VALIDATION_FAILED", "The cursor is not valid", "Refresh the list and try again.");
  }
}

export function encodeTimelineCursor(cursor: TimelineCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}
