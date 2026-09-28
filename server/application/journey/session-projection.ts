import type { SessionRecord } from "../../domain/journey-state.js";
import { effectiveSessionSeconds } from "../dashboard/temporal.js";
import { sessionEtag } from "../task-etag.js";

export function projectSession(session: SessionRecord, generatedAt: string) {
  return {
    id: session.id, etag: sessionEtag(session), taskId: session.taskId,
    startedAt: session.startedAt, endedAt: session.endedAt ?? null,
    timeZoneAtStart: session.timeZoneAtStart,
    ...(session.intentionMinutes ? { intentionMinutes: session.intentionMinutes } : {}),
    actualSecondsAtGeneratedAt: effectiveSessionSeconds(session, generatedAt),
    createdAt: session.createdAt, updatedAt: session.updatedAt, correctedAt: session.correctedAt ?? null,
  };
}
