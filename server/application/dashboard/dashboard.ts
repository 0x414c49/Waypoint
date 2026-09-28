import type { JourneyState, TaskRecord } from "../../domain/journey-state.js";
import { sessionEtag } from "../task-etag.js";
import type { Dashboard, DashboardState } from "./dashboard-types.js";
import { projectTask } from "./task-projection.js";
import { addLocalDays, closedSessionSegments, contributionLevel, effectiveSessionSeconds, localDate } from "./temporal.js";

export type { Dashboard, DashboardState, PlanProjection, TaskProjection } from "./dashboard-types.js";

function mostRecentPaused(state: JourneyState, tasks: TaskRecord[]): TaskRecord | undefined {
  return tasks
    .filter((task) => task.status === "PAUSED")
    .map((task) => ({
      task,
      latest: Object.values(state.records.sessions)
        .filter((session) => session.taskId === task.id)
        .reduce((latest, session) => (session.startedAt > latest ? session.startedAt : latest), ""),
    }))
    .sort((left, right) => right.latest.localeCompare(left.latest))[0]?.task;
}

export function projectDashboard(state: JourneyState, userId: string, now: Date): Dashboard {
  const user = state.records.users[userId];
  if (!user) throw new Error("Validated state lost the current user.");
  const generatedAt = now.toISOString();
  const today = localDate(now, user.timeZone);
  const allQuarters = Object.values(state.records.quarters).filter((quarter) => quarter.userId === userId);
  const currentQuarter = allQuarters.find(
    (quarter) => quarter.startDate <= today && quarter.endDate >= today,
  );
  const ownedTasks = Object.values(state.records.tasks).filter((task) => {
    const quarter = state.records.quarters[task.quarterId];
    return quarter?.userId === userId;
  });
  const tasks = ownedTasks.filter((task) => !task.removedFromPlanAt);
  const activeSession = Object.values(state.records.sessions).find((session) => !session.endedAt);
  const running = activeSession ? ownedTasks.find((task) => task.id === activeSession.taskId) : undefined;
  const paused = running ? undefined : mostRecentPaused(state, ownedTasks);
  const todayTasks = currentQuarter
    ? tasks
        .filter((task) => task.quarterId === currentQuarter.id && task.plannedDate === today)
        .sort((left, right) => left.position - right.position)
    : [];
  let ready = !running && !paused
    ? todayTasks.find((task) => task.status === "NOT_STARTED" && task.recommendationMode === "DEFAULT")
    : undefined;
  let readyReason = "SCHEDULED_TODAY";
  const whenClear = todayTasks.find(
    (task) => task.status === "NOT_STARTED" && task.recommendationMode === "WHEN_CLEAR",
  );
  if (!running && !paused && !ready && whenClear) {
    const catchUp = tasks
      .filter(
        (task) =>
          task.milestoneId === whenClear.milestoneId &&
          task.plannedDate < today &&
          task.status === "NOT_STARTED" &&
          task.recommendationMode === "DEFAULT",
      )
      .sort((left, right) => right.plannedDate.localeCompare(left.plannedDate) || right.position - left.position)[0];
    ready = catchUp ?? whenClear;
    readyReason = catchUp ? "CATCH_UP" : "TODAY_WHEN_CLEAR";
  }
  const heroTask = running ?? paused ?? ready;
  const finishedToday = Object.values(state.records.taskLifecycleEvents)
    .filter(
      (event) =>
        event.type === "FINISHED" &&
        localDate(event.occurredAt, event.timeZoneAtOccurrence) === today &&
        !Object.values(state.records.taskLifecycleEvents).some(
          (later) => later.type === "REOPENED" && later.undoesEventId === event.id,
        ),
    )
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0];
  const stateName: DashboardState = running
    ? "RUNNING"
    : paused
      ? "PAUSED"
      : ready
        ? "READY"
        : finishedToday
          ? "FINISHED"
          : allQuarters.length === 0
            ? "ONBOARDING"
            : "LIGHT";
  const heroProjection = heroTask ? projectTask(state, heroTask, generatedAt) : null;
  const scheduledUpNext = heroTask
    ? todayTasks.find((task) => task.id !== heroTask.id && task.status === "NOT_STARTED" && task.recommendationMode === "DEFAULT") ??
      todayTasks.find((task) => task.id !== heroTask.id && task.status === "NOT_STARTED" && task.recommendationMode === "WHEN_CLEAR")
    : undefined;
  const optional = todayTasks.find(
    (task) => task.status === "NOT_STARTED" && task.recommendationMode === "OPTIONAL",
  );

  const activityDays = Array.from({ length: 14 }, (_, index) => addLocalDays(today, index - 13)).map((date) => {
    const seconds = Object.values(state.records.sessions).reduce(
      (total, session) => total + closedSessionSegments(session).filter((part) => part.date === date).reduce((sum, part) => sum + part.seconds, 0),
      0,
    );
    return { date, sessionSeconds: seconds, level: contributionLevel(seconds) };
  });
  const milestone = currentQuarter
    ? Object.values(state.records.milestones).find(
        (candidate) => candidate.quarterId === currentQuarter.id && candidate.startDate <= today && candidate.endDate >= today,
      )
    : undefined;
  const milestoneTasks = milestone ? ownedTasks.filter((task) => task.milestoneId === milestone.id) : [];
  const milestoneSessions = milestoneTasks.flatMap((task) =>
    Object.values(state.records.sessions).filter((session) => session.taskId === task.id),
  );
  const nearestQuarter = currentQuarter ?? allQuarters.sort((left, right) => left.startDate.localeCompare(right.startDate))[0];
  let lightReason = "NO_PLANNED_ITEM";
  if (!currentQuarter && nearestQuarter) lightReason = nearestQuarter.startDate > today ? "QUARTER_NOT_STARTED" : "BETWEEN_QUARTERS";
  else if (optional) lightReason = "PLAN_OPTIONAL";
  else if (milestone?.mode === "LIGHT") lightReason = "PLAN_LIGHT";
  else if (milestone?.mode === "BUFFER") lightReason = "PLAN_BUFFER";
  else if (todayTasks.length > 0 && todayTasks.every((task) => task.status === "FINISHED" || task.status === "SKIPPED")) lightReason = "ALL_ITEMS_CLOSED";

  return {
    dataRevision: state.storeRevision,
    generatedAt,
    today,
    timeZone: user.timeZone,
    quarter: nearestQuarter
      ? { id: nearestQuarter.id, title: nearestQuarter.title, planRevision: nearestQuarter.planRevision }
      : null,
    state: stateName,
    hero:
      heroProjection
        ? {
            state: stateName,
            reason: running ? "ACTIVE_SESSION" : paused ? "MOST_RECENT_UNFINISHED" : readyReason,
            task: heroProjection,
            timing: heroProjection.timing,
            primaryAction: { kind: running ? "PAUSE" : paused ? "RESUME" : "START" },
            secondaryActions: running || paused
              ? [{ kind: "FINISH" }]
              : [{ kind: "DO_TEN_MINUTES" }],
          }
        : {
            state: stateName,
            reason: stateName === "FINISHED" ? "COMPLETED_TODAY" : stateName === "ONBOARDING" ? "NO_QUARTER" : lightReason,
            task: null,
            timing: null,
            primaryAction: null,
            secondaryActions: [],
          },
    activeSession:
      activeSession && running && heroProjection
        ? {
            id: activeSession.id,
            etag: sessionEtag(activeSession),
            task: { id: running.id, title: heroProjection.displayPlan.title, etag: heroProjection.etag },
            startedAt: activeSession.startedAt,
            timeZoneAtStart: activeSession.timeZoneAtStart,
            ...(activeSession.intentionMinutes ? { intentionMinutes: activeSession.intentionMinutes } : {}),
            sessionElapsedSecondsAtGeneratedAt: effectiveSessionSeconds(activeSession, generatedAt),
            taskActualSecondsAtGeneratedAt: heroProjection.timing.actualSecondsAtGeneratedAt,
          }
        : null,
    upNext: scheduledUpNext
      ? {
          reason: scheduledUpNext.recommendationMode === "DEFAULT" ? "SCHEDULED_TODAY" : "TODAY_WHEN_CLEAR",
          task: projectTask(state, scheduledUpNext, generatedAt),
          remainingTodayCount: todayTasks.filter(
            (task) => task.id !== heroTask?.id && task.id !== scheduledUpNext.id && task.status === "NOT_STARTED" && task.recommendationMode !== "OPTIONAL",
          ).length,
        }
      : null,
    optionalToday: optional ? { label: "Only if useful", task: projectTask(state, optional, generatedAt) } : null,
    activityPreview: {
      startDate: activityDays[0]!.date,
      endDate: activityDays[13]!.date,
      days: activityDays,
    },
    milestoneSummary:
      milestone
        ? {
            id: milestone.id,
            title: milestone.title,
            startDate: milestone.startDate,
            endDate: milestone.endDate,
            mode: milestone.mode,
            sessionSeconds: milestoneSessions.reduce((sum, session) => sum + effectiveSessionSeconds(session, generatedAt), 0),
            sessionCount: milestoneSessions.length,
            plannedItemCount: milestoneTasks.length,
            touchedItemCount: milestoneTasks.filter((task) => task.status !== "NOT_STARTED").length,
            finishedItemCount: milestoneTasks.filter((task) => task.status === "FINISHED").length,
            skippedItemCount: milestoneTasks.filter((task) => task.status === "SKIPPED").length,
            openItemCount: milestoneTasks.filter((task) => task.status === "IN_PROGRESS" || task.status === "PAUSED").length,
            thoughtCount: 0,
            changedMyMindCount: 0,
            href: `/api/quarters/${milestone.quarterId}/milestones/${milestone.id}/summary`,
          }
        : null,
    decisionReviewsDue: { count: 0, items: [] },
  };
}
