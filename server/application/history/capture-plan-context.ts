import type { JourneyState, MilestoneRecord, TaskRecord } from "../../domain/journey-state.js";

function captureQuarter(state: JourneyState, quarterId: string, timeZone: string, occurredAt: string): void {
  const quarter = state.records.quarters[quarterId]!;
  if (quarter.intentSnapshot) return;
  quarter.intentSnapshot = {
    capturedAt: occurredAt,
    planRevision: quarter.planRevision,
    timeZoneAtCapture: timeZone,
    title: quarter.title,
    ...(quarter.description ? { description: quarter.description } : {}),
    ...(quarter.mantra ? { mantra: quarter.mantra } : {}),
    startDate: quarter.startDate,
    endDate: quarter.endDate,
    successCriteria: structuredClone(quarter.successCriteria),
    focusAreas: Object.values(state.records.focusAreas)
      .filter((area) => area.quarterId === quarter.id && !area.removedFromPlanAt)
      .sort((left, right) => left.position - right.position)
      .map((area) => ({
        id: area.id,
        name: area.name,
        ...(area.targetMinutes ? { targetMinutes: area.targetMinutes } : {}),
      })),
  };
}

export function captureMilestoneContext(
  state: JourneyState,
  milestone: MilestoneRecord,
  timeZone: string,
  occurredAt: string,
): void {
  const quarter = state.records.quarters[milestone.quarterId]!;
  if (!milestone.intentSnapshot) {
    milestone.intentSnapshot = {
      capturedAt: occurredAt,
      planRevision: quarter.planRevision,
      timeZoneAtCapture: timeZone,
      title: milestone.title,
      ...(milestone.description ? { description: milestone.description } : {}),
      startDate: milestone.startDate,
      endDate: milestone.endDate,
      mode: milestone.mode,
      position: milestone.position,
    };
  }
  captureQuarter(state, quarter.id, timeZone, occurredAt);
}

export function captureTaskPlanContext(
  state: JourneyState,
  task: TaskRecord,
  timeZone: string,
  occurredAt: string,
): void {
  const quarter = state.records.quarters[task.quarterId]!;
  const area = task.focusAreaId ? state.records.focusAreas[task.focusAreaId] : undefined;
  const milestoneId = task.planSnapshot?.milestoneId ?? task.milestoneId;
  const milestone = milestoneId ? state.records.milestones[milestoneId] : undefined;
  if (!task.planSnapshot) {
    task.planSnapshot = {
      capturedAt: occurredAt,
      planRevision: quarter.planRevision,
      ...(area ? { focusAreaId: area.id, focusAreaName: area.name } : {}),
      ...(milestone ? { milestoneId: milestone.id, milestoneTitle: milestone.title } : {}),
      plannedDate: task.plannedDate,
      title: task.title,
      ...(task.description ? { description: task.description } : {}),
      ...(task.plannedMinutes ? { plannedMinutes: task.plannedMinutes } : {}),
      tags: [...task.tags],
      recommendationMode: task.recommendationMode,
      ...(task.decisionPrompt ? { decisionPrompt: structuredClone(task.decisionPrompt) } : {}),
    };
  }
  if (milestone) captureMilestoneContext(state, milestone, timeZone, occurredAt);
  else captureQuarter(state, quarter.id, timeZone, occurredAt);
}
