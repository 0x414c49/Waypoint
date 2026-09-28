import { render, screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TodayPage } from "./TodayPage.js";
import type { Dashboard, TaskProjection } from "./types.js";

function task(status: TaskProjection["status"], etag = `etag-${status}`): TaskProjection {
  const plan = {
    focusArea: { id: "systems", name: "Systems reliability" },
    plannedDate: "2026-09-27",
    title: "Understand partial failure",
    description: "Trace one failure through the system.",
    plannedMinutes: 40,
    tags: [],
    recommendationMode: "DEFAULT" as const,
  };
  return {
    id: "partial-failure",
    etag,
    status,
    currentPlan: plan,
    displayPlanSource: "CURRENT",
    displayPlan: plan,
    timing: {
      actualSecondsAtGeneratedAt: status === "NOT_STARTED" ? 0 : 120,
      firstStartedAt: status === "NOT_STARTED" ? null : "2026-09-27T08:00:00.000Z",
      runningSince: status === "IN_PROGRESS" ? "2026-09-27T08:00:00.000Z" : null,
    },
    availableActions:
      status === "NOT_STARTED" ? ["START", "DO_TEN_MINUTES"]
      : status === "IN_PROGRESS" ? ["PAUSE", "FINISH"]
      : status === "PAUSED" ? ["RESUME", "FINISH"]
      : ["REOPEN"],
  };
}

function dashboard(state: Dashboard["state"], heroTask: TaskProjection | null): Dashboard {
  return {
    dataRevision: 1,
    generatedAt: new Date().toISOString(),
    today: "2026-09-27",
    timeZone: "Europe/Amsterdam",
    quarter: { id: "q4", title: "Q4", planRevision: 1 },
    state,
    hero: {
      state,
      reason: "TEST",
      task: heroTask,
      timing: heroTask?.timing ?? null,
      primaryAction: null,
      secondaryActions: [],
    },
    activeSession: state === "RUNNING" && heroTask ? {
      id: "session-1",
      etag: "session-etag",
      task: { id: heroTask.id, title: heroTask.displayPlan.title, etag: heroTask.etag },
      startedAt: "2026-09-27T08:00:00.000Z",
      timeZoneAtStart: "Europe/Amsterdam",
      sessionElapsedSecondsAtGeneratedAt: 120,
      taskActualSecondsAtGeneratedAt: 120,
    } : null,
    upNext: null,
    optionalToday: null,
    activityPreview: { startDate: "2026-09-14", endDate: "2026-09-27", days: [] },
    milestoneSummary: null,
    decisionReviewsDue: { count: 0, items: [] },
  };
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": status >= 400 ? "application/problem+json" : "application/json" },
  });
}

describe("Today", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("starts the recommendation with concurrency and idempotency headers", async () => {
    const readyTask = task("NOT_STARTED");
    const runningTask = task("IN_PROGRESS", "etag-running");
    const ready = dashboard("READY", readyTask);
    const running = { ...dashboard("RUNNING", runningTask), dataRevision: 2 };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(ready))
      .mockResolvedValueOnce(json({ task: runningTask, activeSession: running.activeSession, affectedTasks: [], dashboard: running }));
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<TodayPage />);
    await user.click(await screen.findByRole("button", { name: "Start session" }));

    await screen.findByRole("button", { name: "Pause" });
    const [url, options] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("/api/tasks/partial-failure/start");
    expect(new Headers(options.headers).get("If-Match")).toBe("etag-NOT_STARTED");
    expect(new Headers(options.headers).get("Idempotency-Key")?.length).toBeGreaterThanOrEqual(16);
  });

  it("pauses before opening Finish and stays paused when the dialog is cancelled", async () => {
    const runningTask = task("IN_PROGRESS", "etag-running");
    const pausedTask = task("PAUSED", "etag-paused");
    const running = dashboard("RUNNING", runningTask);
    const paused = { ...dashboard("PAUSED", pausedTask), dataRevision: 2 };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(running))
      .mockResolvedValueOnce(json({ task: pausedTask, activeSession: null, affectedTasks: [], dashboard: paused }));
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<TodayPage />);
    await user.click(await screen.findByRole("button", { name: "Finish item" }));

    const dialog = await screen.findByRole("dialog", { name: "How did it land?" });
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/tasks/partial-failure/pause");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Resume" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("requires an outcome and reopens a completion using its closure event", async () => {
    const pausedTask = task("PAUSED", "etag-paused");
    const finishedTask = task("FINISHED", "etag-finished");
    const paused = dashboard("PAUSED", pausedTask);
    const finished = { ...dashboard("FINISHED", null), dataRevision: 2 };
    const reopenedTask = task("PAUSED", "etag-reopened");
    const reopened = { ...dashboard("PAUSED", reopenedTask), dataRevision: 3 };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(paused))
      .mockResolvedValueOnce(json({
        task: finishedTask,
        activeSession: null,
        affectedTasks: [],
        dashboard: finished,
        completion: {
          taskId: finishedTask.id,
          finishEventId: "finish-event-1",
          reviewId: "review-1",
          outcome: "PARTIAL",
          undoUntil: new Date(Date.now() + 300_000).toISOString(),
        },
      }))
      .mockResolvedValueOnce(json({ task: reopenedTask, activeSession: null, affectedTasks: [], dashboard: reopened }));
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<TodayPage />);
    await user.click(await screen.findByRole("button", { name: "Finish item" }));
    const dialog = await screen.findByRole("dialog", { name: "How did it land?" });
    await user.click(within(dialog).getByRole("button", { name: "Finish item" }));
    expect(within(dialog).getByText("Choose an outcome to finish this item.")).toBeTruthy();
    await user.click(within(dialog).getByRole("radio", { name: "Made progress" }));
    await user.click(within(dialog).getByRole("button", { name: "Finish item" }));
    await user.click(await screen.findByRole("button", { name: "Undo" }));

    await waitFor(() => expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/tasks/partial-failure/reopen"));
    expect(JSON.parse(fetchMock.mock.calls[2]?.[1]?.body as string)).toEqual({ closureEventId: "finish-event-1" });
  });

  it("offers pause-and-switch when another session wins the race", async () => {
    const readyTask = task("NOT_STARTED");
    const ready = dashboard("READY", readyTask);
    const conflict = {
      type: "urn:test",
      status: 409,
      code: "ACTIVE_SESSION_CONFLICT",
      title: "Another session is running",
      detail: "Pause the current session before starting this item.",
      traceId: "trace-1",
      current: {
        activeSession: {
          id: "session-other",
          startedAt: "2026-09-27T07:00:00.000Z",
          task: { id: "other", title: "Existing work", etag: "etag-other" },
        },
      },
    };
    const runningTask = task("IN_PROGRESS", "etag-running");
    const running = { ...dashboard("RUNNING", runningTask), dataRevision: 2 };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(ready))
      .mockResolvedValueOnce(json(conflict, 409))
      .mockResolvedValueOnce(json({ task: runningTask, activeSession: running.activeSession, affectedTasks: [], dashboard: running }));
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<TodayPage />);
    await user.click(await screen.findByRole("button", { name: "Start session" }));
    expect(await screen.findByRole("dialog", { name: "Switch to Understand partial failure?" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Pause current and switch" }));

    await screen.findByRole("button", { name: "Pause" });
    expect(JSON.parse(fetchMock.mock.calls[2]?.[1]?.body as string)).toEqual({
      activeSessionResolution: {
        kind: "PAUSE_AND_SWITCH",
        activeSessionId: "session-other",
        activeTaskEtag: "etag-other",
      },
    });
  });
});
