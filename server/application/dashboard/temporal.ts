import type { SessionRecord } from "../../domain/journey-state.js";

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

export function localDate(instant: Date | string | number, timeZone: string): string {
  let formatter = dateFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    dateFormatters.set(timeZone, formatter);
  }
  const values = Object.fromEntries(formatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function addLocalDays(date: string, amount: number): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + amount)).toISOString().slice(0, 10);
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function isNormalizedUtcInstant(value: string): boolean {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

export function localDateStartInstant(date: string, timeZone: string): number {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const target = Date.UTC(year, month - 1, day);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  let guess = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    const adjustment = target - represented;
    guess += adjustment;
    if (adjustment === 0) return guess;
  }
  return guess;
}

export function effectiveSessionSeconds(session: SessionRecord, generatedAt: string): number {
  return Math.max(0, Math.floor((Date.parse(session.endedAt ?? generatedAt) - Date.parse(session.startedAt)) / 1000));
}

export function closedSessionSegments(session: SessionRecord): Array<{ date: string; seconds: number }> {
  if (!session.endedAt) return [];
  let cursor = Date.parse(session.startedAt);
  const end = Date.parse(session.endedAt);
  const segments: Array<{ date: string; seconds: number }> = [];
  while (cursor < end) {
    const date = localDate(cursor, session.timeZoneAtStart);
    let high = Math.min(end, cursor + 27 * 60 * 60 * 1000);
    if (localDate(high, session.timeZoneAtStart) === date) high = end;
    let boundary = high;
    if (high < end || localDate(high, session.timeZoneAtStart) !== date) {
      let low = cursor;
      while (high - low > 1) {
        const mid = Math.floor((low + high) / 2);
        if (localDate(mid, session.timeZoneAtStart) === date) low = mid;
        else high = mid;
      }
      boundary = high;
    }
    const seconds = Math.max(0, Math.floor((boundary - cursor) / 1000));
    const existing = segments.find((item) => item.date === date);
    if (existing) existing.seconds += seconds;
    else segments.push({ date, seconds });
    cursor = boundary;
  }
  return segments;
}

export function contributionLevel(seconds: number): number {
  if (seconds === 0) return 0;
  if (seconds < 900) return 1;
  if (seconds < 1800) return 2;
  if (seconds < 3600) return 3;
  return 4;
}
