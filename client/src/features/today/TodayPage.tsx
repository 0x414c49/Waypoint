import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Button } from "../../ui/Button.js";
import { DueDecisionNotice } from "../decisions/DueDecisionNotice.js";
import { actOnTask, ApiError, createIdempotencyKey, getDashboard } from "./api.js";
import { ActiveSessionConflictDialog } from "./ActiveSessionConflictDialog.js";
import { ActivityPreview } from "./ActivityPreview.js";
import { TodayContext } from "./TodayContext.js";
import { TodayHero } from "./TodayHero.js";
import type {
  ActionBody,
  Dashboard,
  FinishOutcome,
  ProblemDetails,
  TaskAction,
  TaskActionResponse,
  TaskProjection,
} from "./types.js";
import styles from "./Today.module.css";

const FinishDialog = lazy(() => import("./FinishDialog.js").then((module) => ({ default: module.FinishDialog })));

interface PendingSwitch {
  task: TaskProjection;
  action: "start" | "resume";
  body: ActionBody;
  activeSession: NonNullable<ProblemDetails["current"]>["activeSession"];
}

interface RecentCompletion {
  task: TaskProjection;
  closureEventId: string;
  undoUntil: string;
}

function friendlyDate(date: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

function messageFor(error: unknown): string {
  if (error instanceof ApiError) return error.problem.detail;
  return "The local tracker could not be reached. Try again.";
}

export function TodayPage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finishTask, setFinishTask] = useState<TaskProjection | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<PendingSwitch | null>(null);
  const [completion, setCompletion] = useState<RecentCompletion | null>(null);

  const acceptDashboard = useCallback((incoming: Dashboard) => {
    setDashboard((current) =>
      current && current.dataRevision > incoming.dataRevision ? current : incoming,
    );
    window.dispatchEvent(new CustomEvent("journey:dashboard-changed", { detail: incoming }));
  }, []);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setError(null);
    try {
      const next = await getDashboard(signal);
      acceptDashboard(next);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(messageFor(caught));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [acceptDashboard]);

  useEffect(() => {
    const controller = new AbortController();
    void getDashboard(controller.signal)
      .then(acceptDashboard)
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(messageFor(caught));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [acceptDashboard]);

  useEffect(() => {
    if (!completion) return;
    const remaining = Date.parse(completion.undoUntil) - Date.now();
    const timeout = window.setTimeout(
      () => setCompletion(null),
      Math.max(0, Math.min(remaining, 5 * 60 * 1000)),
    );
    return () => window.clearTimeout(timeout);
  }, [completion]);

  const execute = useCallback(async (
    task: TaskProjection,
    action: TaskAction,
    body: ActionBody = {},
  ): Promise<TaskActionResponse | null> => {
    setBusy(true);
    setError(null);
    try {
      const response = await actOnTask(task.id, action, task.etag, createIdempotencyKey(), body);
      acceptDashboard(response.dashboard);
      return response;
    } catch (caught) {
      if (
        caught instanceof ApiError &&
        caught.problem.code === "ACTIVE_SESSION_CONFLICT" &&
        (action === "start" || action === "resume")
      ) {
        setPendingSwitch({
          task,
          action,
          body,
          activeSession: caught.problem.current?.activeSession,
        });
      } else {
        setError(messageFor(caught));
        if (caught instanceof ApiError && caught.problem.code === "STALE_WRITE") {
          await refresh();
        }
      }
      return null;
    } finally {
      setBusy(false);
    }
  }, [acceptDashboard, refresh]);

  const start = useCallback((task: TaskProjection, tenMinutes = false) => {
    void execute(task, "start", tenMinutes ? { intentionMinutes: 10 } : {});
  }, [execute]);

  const pause = useCallback((task: TaskProjection) => {
    void execute(task, "pause");
  }, [execute]);

  const resume = useCallback((task: TaskProjection) => {
    void execute(task, "resume");
  }, [execute]);

  const openFinish = useCallback(async (task: TaskProjection) => {
    if (task.status === "IN_PROGRESS") {
      const response = await execute(task, "pause");
      if (response) setFinishTask(response.task);
      return;
    }
    setFinishTask(task);
  }, [execute]);

  const finish = useCallback(async (outcome: FinishOutcome, keyLearning?: string) => {
    if (!finishTask) return;
    const response = await execute(finishTask, "finish", {
      outcome,
      ...(keyLearning ? { keyLearning } : {}),
    });
    if (!response?.completion) return;
    setFinishTask(null);
    setCompletion({
      task: response.task,
      closureEventId: response.completion.finishEventId,
      undoUntil: response.completion.undoUntil,
    });
  }, [execute, finishTask]);

  const openContextTask = useCallback((task: TaskProjection) => {
    void execute(task, task.status === "PAUSED" ? "resume" : "start");
  }, [execute]);

  const confirmSwitch = useCallback(async () => {
    if (!pendingSwitch?.activeSession) return;
    const { task, action, body, activeSession } = pendingSwitch;
    const response = await execute(task, action, {
      ...body,
      activeSessionResolution: {
        kind: "PAUSE_AND_SWITCH",
        activeSessionId: activeSession.id,
        activeTaskEtag: activeSession.task.etag,
      },
    });
    if (response) setPendingSwitch(null);
  }, [execute, pendingSwitch]);

  const undoCompletion = useCallback(async () => {
    if (!completion) return;
    const response = await execute(completion.task, "reopen", {
      closureEventId: completion.closureEventId,
    });
    if (response) setCompletion(null);
  }, [completion, execute]);

  const closeFinish = useCallback(() => setFinishTask(null), []);
  const closeSwitch = useCallback(() => setPendingSwitch(null), []);

  if (loading && !dashboard) {
    return <p className={styles.loading} role="status">Opening Today…</p>;
  }

  if (!dashboard) {
    return (
      <section className={styles.loadError} aria-labelledby="today-load-error">
        <h1 id="today-load-error">Today could not open.</h1>
        <p>{error}</p>
        <Button variant="primary" onClick={() => void refresh()}>Try again</Button>
      </section>
    );
  }

  return (
    <>
      <div id="today-content" className={styles.page}>
        <header className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Today</h1>
            <p className={styles.dateLine}>{friendlyDate(dashboard.today)}</p>
          </div>
          <span className={styles.localStatus}>Stored on this device</span>
        </header>

        {error ? (
          <div className={styles.errorBanner} role="alert">
            <span>{error}</span>
            <Button variant="ghost" onClick={() => void refresh()}>Refresh</Button>
          </div>
        ) : null}

        {completion ? (
          <div className={styles.completion} role="status">
            <span><strong>Finished.</strong> {completion.task.displayPlan.title}</span>
            <Button variant="ghost" disabled={busy} onClick={() => void undoCompletion()}>Undo</Button>
          </div>
        ) : null}

        <TodayHero
          dashboard={dashboard}
          busy={busy}
          onStart={start}
          onPause={pause}
          onResume={resume}
          onFinish={(task) => void openFinish(task)}
          onThought={() => window.dispatchEvent(new Event("journey:open-thought"))}
        />
        <DueDecisionNotice due={dashboard.decisionReviewsDue} />
        <TodayContext
          upNext={dashboard.upNext}
          optionalToday={dashboard.optionalToday}
          leftovers={dashboard.leftovers}
          busy={busy}
          onOpen={openContextTask}
        />
        <ActivityPreview activity={dashboard.activityPreview} milestone={dashboard.milestoneSummary} />
      </div>

      {dashboard.hero.task && (dashboard.state === "RUNNING" || dashboard.state === "PAUSED") ? (
        <aside className={styles.sessionDock} aria-label="Session action dock">
          <div className={styles.sessionDockIdentity}>
            <span>{dashboard.state === "RUNNING" ? "Running" : "Paused"}</span>
            <strong>{dashboard.hero.task.displayPlan.title}</strong>
          </div>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => dashboard.state === "RUNNING" ? pause(dashboard.hero.task!) : resume(dashboard.hero.task!)}
          >
            {dashboard.state === "RUNNING" ? "Pause" : "Resume"}
          </Button>
        </aside>
      ) : null}

      {finishTask ? (
        <Suspense fallback={<p role="status">Opening the finish form…</p>}>
          <FinishDialog
            task={finishTask}
            busy={busy}
            onClose={closeFinish}
            onFinish={(outcome, keyLearning) => void finish(outcome, keyLearning)}
          />
        </Suspense>
      ) : null}
      {pendingSwitch ? (
        <ActiveSessionConflictDialog
          target={pendingSwitch.task}
          activeSession={pendingSwitch.activeSession}
          busy={busy}
          onCancel={closeSwitch}
          onSwitch={() => void confirmSwitch()}
        />
      ) : null}
    </>
  );
}
