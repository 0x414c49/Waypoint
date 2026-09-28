import type { CurrentUserProvider } from "../../adapters/local-current-user-provider.js";
import type { Clock } from "../../ports/clock.js";
import { STANDARD_INTENT, type JourneyStore } from "../../ports/journey-store.js";
import { AppError, notFound } from "../app-error.js";
import { sessionEtag } from "../task-etag.js";
import { projectSession } from "./session-projection.js";
import { isNormalizedUtcInstant } from "../dashboard/temporal.js";

export class SessionCorrectionService {
  constructor(private readonly store: JourneyStore, private readonly currentUser: CurrentUserProvider, private readonly clock: Clock) {}

  async correct(id: string, input: { startedAt: string; endedAt?: string }, ifMatch: string) {
    if (!isNormalizedUtcInstant(input.startedAt) || input.endedAt !== undefined && !isNormalizedUtcInstant(input.endedAt)) {
      throw new AppError(422, "VALIDATION_FAILED", "The session times are not valid", "Use normalized UTC timestamps for the corrected times.");
    }
    const userId = await this.currentUser.getCurrentUserId();
    const correctedAt = this.clock.now().toISOString();
    const result = await this.store.transact(STANDARD_INTENT, (draft) => {
      const session = draft.records.sessions[id];
      const task = session ? draft.records.tasks[session.taskId] : undefined;
      if (!session || !task || draft.records.quarters[task.quarterId]?.userId !== userId) throw notFound();
      if (sessionEtag(session) !== ifMatch) throw new AppError(412, "STALE_WRITE", "This session changed", "Refresh the session before correcting it.", { current: { session: projectSession(session, correctedAt) }, resolutions: [{ kind: "REFRESH" }] });
      if (!session.endedAt && input.endedAt !== undefined) throw new AppError(422, "VALIDATION_FAILED", "An active session cannot be ended here", "Use Pause or Finish to end an active session.");
      if (session.endedAt && input.endedAt === undefined) throw new AppError(422, "VALIDATION_FAILED", "The corrected end time is required", "Keep a closed session closed when correcting it.");
      if (input.endedAt !== undefined && input.endedAt < input.startedAt) throw new AppError(422, "VALIDATION_FAILED", "The session interval is not valid", "The end time cannot be before the start time.");
      const candidateEnd = input.endedAt;
      for (const other of Object.values(draft.records.sessions)) {
        if (other.id === id) continue;
        const otherTask = draft.records.tasks[other.taskId];
        if (!otherTask || draft.records.quarters[otherTask.quarterId]?.userId !== userId) continue;
        const candidateIsEmpty = candidateEnd !== undefined && candidateEnd === input.startedAt;
        const otherIsEmpty = other.endedAt !== undefined && other.endedAt === other.startedAt;
        const overlaps = !candidateIsEmpty && !otherIsEmpty &&
          (other.endedAt === undefined || input.startedAt < other.endedAt) &&
          (candidateEnd === undefined || other.startedAt < candidateEnd);
        if (overlaps) throw new AppError(409, "SESSION_OVERLAP", "Those times overlap another session", "Choose times that do not overlap another session.", { current: { conflictingSessionId: other.id } });
      }
      session.startedAt = input.startedAt;
      if (candidateEnd !== undefined) session.endedAt = candidateEnd;
      session.updatedAt = correctedAt;
      session.correctedAt = correctedAt;
      return { kind: "changed" as const, value: id };
    });
    return projectSession(result.state.records.sessions[id]!, correctedAt);
  }
}
