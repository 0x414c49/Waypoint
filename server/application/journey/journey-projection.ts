import type { JourneyEntryRecord, JourneyState } from "../../domain/journey-state.js";
import { localDate } from "../dashboard/temporal.js";
import { opaqueHash } from "../task-etag.js";

export function journeyEntryEtag(entry: JourneyEntryRecord): string {
  return `"journey-${opaqueHash(entry)}"`;
}

function titleForUnknown(record: { id: string; title?: unknown } | undefined): string | null {
  return record && typeof record.title === "string" ? record.title : null;
}

export function projectJourneyEntry(state: JourneyState, entry: JourneyEntryRecord) {
  const task = entry.relatedTaskId ? state.records.tasks[entry.relatedTaskId] : undefined;
  const milestone = entry.relatedMilestoneId ? state.records.milestones[entry.relatedMilestoneId] : undefined;
  const decision = entry.relatedDecisionId ? state.records.decisionRecords[entry.relatedDecisionId] : undefined;
  const taskTitle = task?.planSnapshot?.title ?? task?.title;
  return {
    id: entry.id,
    etag: journeyEntryEtag(entry),
    type: entry.relatedMilestoneId && !entry.relatedTaskId ? "WEEKLY_REFLECTION" as const : "THOUGHT" as const,
    occurredAt: entry.occurredAt,
    localDate: localDate(entry.occurredAt, entry.timeZoneAtOccurrence),
    text: entry.text,
    tags: [...entry.tags],
    changedMyMind: entry.changedMyMind,
    relatedTask: task && taskTitle ? { id: task.id, title: taskTitle } : null,
    relatedMilestone: milestone ? { id: milestone.id, quarterId: milestone.quarterId, title: milestone.intentSnapshot?.title ?? milestone.title } : null,
    relatedDecision: decision ? { id: decision.id, title: titleForUnknown(decision) ?? decision.id } : null,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt ?? null,
  };
}
