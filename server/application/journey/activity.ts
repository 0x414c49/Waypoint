import type { JourneyState } from "../../domain/journey-state.js";
import { addLocalDays, closedSessionSegments, contributionLevel, isCalendarDate } from "../dashboard/temporal.js";
import { AppError } from "../app-error.js";

export function projectActivity(state: JourneyState, userId: string, from: string, to: string) {
  if (!isCalendarDate(from) || !isCalendarDate(to)) throw new AppError(422, "VALIDATION_FAILED", "The date range is not valid", "Use real calendar dates in YYYY-MM-DD form.");
  if (from > to) throw new AppError(422, "VALIDATION_FAILED", "The date range is not valid", "Choose an end date on or after the start date.");
  const days: string[] = [];
  for (let date = from; date <= to; date = addLocalDays(date, 1)) {
    days.push(date);
    if (days.length > 366) throw new AppError(422, "VALIDATION_FAILED", "The date range is too long", "Choose a range of 366 days or fewer.");
  }
  const seconds = new Map(days.map((date) => [date, 0]));
  for (const session of Object.values(state.records.sessions)) {
    const task = state.records.tasks[session.taskId];
    if (!task || state.records.quarters[task.quarterId]?.userId !== userId) continue;
    for (const segment of closedSessionSegments(session)) {
      if (seconds.has(segment.date)) seconds.set(segment.date, seconds.get(segment.date)! + segment.seconds);
    }
  }
  return { from, to, days: days.map((date) => ({ date, sessionSeconds: seconds.get(date)!, level: contributionLevel(seconds.get(date)!) })) };
}
