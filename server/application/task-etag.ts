import { createHash } from "node:crypto";
import type { JourneyState, TaskRecord } from "../domain/journey-state.js";

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stable(child)]),
    );
  }
  return value;
}

export function opaqueHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("base64url").slice(0, 22);
}

export function taskEtag(state: JourneyState, task: TaskRecord): string {
  const sessions = Object.values(state.records.sessions)
    .filter((session) => session.taskId === task.id)
    .map((session) => [session.id, session.startedAt, session.endedAt, session.updatedAt])
    .sort(([left], [right]) => String(left).localeCompare(String(right)));
  const lifecycle = Object.values(state.records.taskLifecycleEvents)
    .filter((event) => event.taskId === task.id)
    .map((event) => [event.id, event.sequence, event.type])
    .sort(([left], [right]) => String(left).localeCompare(String(right)));
  return `"task-${opaqueHash([task, sessions, lifecycle])}"`;
}

export function sessionEtag(session: JourneyState["records"]["sessions"][string]): string {
  return `"session-${opaqueHash(session)}"`;
}
