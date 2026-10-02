import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "../../ui/Button.js";
import { DecisionContextAction } from "../decisions/DecisionContextAction.js";
import { getTaskDetail } from "./api.js";
import { CarryForwardForm } from "./CarryForwardForm.js";
import { SessionCorrectionDialog } from "./SessionCorrectionDialog.js";
import { TaskSessions } from "./TaskSessions.js";
import type { SessionDetail, TaskDetail } from "./types.js";
import styles from "./Journey.module.css";
import { MarkdownContent } from "../../ui/MarkdownContent.js";
import { FeelingNote } from "./FeelingPicker.js";
import { Icon } from "../../ui/Icon.js";
import { actOnTask, ApiError, createIdempotencyKey } from "../today/api.js";
import { ActiveSessionConflictDialog } from "../today/ActiveSessionConflictDialog.js";
import type { ActiveSessionResolution, ConflictSession } from "../today/types.js";

function duration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const remainingMinutes = minutes % 60;
  return `${Math.floor(minutes / 60)}h${remainingMinutes ? ` ${remainingMinutes}m` : ""}`;
}

function taskStatus(status: TaskDetail["task"]["status"]): string {
  return { NOT_STARTED: "Not started", IN_PROGRESS: "Running", PAUSED: "Paused", FINISHED: "Finished", SKIPPED: "Skipped" }[status];
}

function plannedDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T12:00:00.000Z`));
}

export function TaskDetailPage() {
  const { taskId = "" } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [correcting, setCorrecting] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [conflictingSession, setConflictingSession] = useState<ConflictSession | null>(null);

  const load = useCallback((signal?: AbortSignal) => {
    void getTaskDetail(taskId, signal).then(setDetail).catch((caught: unknown) => {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "This task could not be opened.");
    });
  }, [taskId]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const startOrResume = useCallback(async (resolution?: ActiveSessionResolution) => {
    if (!detail || starting) return;
    const action = detail.task.status === "PAUSED" ? "resume" : "start";
    setStarting(true);
    setStartError(null);
    try {
      const response = await actOnTask(detail.task.id, action, detail.task.etag, createIdempotencyKey(),
        resolution ? { activeSessionResolution: resolution } : {});
      window.dispatchEvent(new CustomEvent("journey:dashboard-changed", { detail: response.dashboard }));
      navigate("/");
    } catch (caught) {
      if (caught instanceof ApiError && caught.problem.code === "ACTIVE_SESSION_CONFLICT") {
        const active = caught.problem.current?.activeSession;
        if (active) setConflictingSession(active);
        else setStartError(caught.problem.detail);
      } else {
        setConflictingSession(null);
        setStartError(caught instanceof Error ? caught.message : "This item could not be started. Try again.");
        if (caught instanceof ApiError && caught.problem.code === "STALE_WRITE") load();
      }
    } finally {
      setStarting(false);
    }
  }, [detail, load, navigate, starting]);

  if (error && !detail) return <section className={styles.errorPanel}><h1>Task could not open.</h1><p>{error}</p><Button onClick={() => { setError(null); load(); }}>Try again</Button></section>;
  if (!detail) return <p role="status" className={styles.muted}>Opening task history…</p>;

  const { task } = detail;
  const plan = task.displayPlan;
  const latestReview = detail.reviews.at(-1);
  return (
    <>
    <div className={`${styles.page} ${styles.taskDetailPage}`} id="task-detail-content">
      <Link className={styles.backLink} to="/journey"><Icon name="back" width={16} height={16} />Back to Journey</Link>

      <header className={styles.taskBrief}>
        <div className={styles.taskBriefBody}>
          <div className={styles.taskMetaRow}>
            <span className={styles.statusBadge} data-status={task.status}>{taskStatus(task.status)}</span>
            <span className={styles.plannedDate}><Icon name="calendar" width={15} height={15} />Planned {plannedDate(plan.plannedDate)}</span>
          </div>
          <h1>{plan.title}</h1>
          <p className={styles.taskFocus}>{plan.focusArea?.name ?? "Learning plan"}</p>
          {task.displayPlanSource === "HISTORICAL" ? <p className={styles.historyNotice}>Showing the plan text captured when this work began.</p> : null}
          {plan.description ? <div className={styles.lead}><MarkdownContent>{plan.description}</MarkdownContent></div> : null}
          {(task.status === "NOT_STARTED" || task.status === "PAUSED") ? (
            <div>
              <Button variant="primary" disabled={starting} onClick={() => void startOrResume()}>
                {starting ? "Opening…" : task.status === "PAUSED" ? "Resume item" : "Start session"}
              </Button>
              {startError ? <p role="alert">{startError}</p> : null}
            </div>
          ) : null}
          <DecisionContextAction task={task} />
        </div>

        <aside className={styles.timeSummary} aria-label={`${duration(task.timing.actualSecondsAtGeneratedAt)} recorded`}>
          <span className={styles.timeIcon}><Icon name="clock" width={22} height={22} /></span>
          <span className={styles.timeLabel}>Time recorded</span>
          <strong>{duration(task.timing.actualSecondsAtGeneratedAt)}</strong>
          <span className={styles.timeContext}>
            {detail.sessions.length === 0
              ? plan.plannedMinutes ? `${plan.plannedMinutes} min planned · no sessions yet` : "No sessions yet"
              : `${detail.sessions.length} ${detail.sessions.length === 1 ? "session" : "sessions"}`}
          </span>
        </aside>
      </header>

      {latestReview ? (
        <section className={`${styles.detailSection} ${styles.detailCard} ${styles.outcomeCard}`} aria-labelledby="outcome-title">
          <h2 id="outcome-title">Outcome</h2>
          <p><strong>{latestReview.outcome === "PARTIAL" ? "Made progress" : latestReview.outcome.replace("_", " ").toLowerCase()}</strong></p>
          {latestReview.keyLearning ? <blockquote><MarkdownContent>{latestReview.keyLearning}</MarkdownContent></blockquote> : null}
        </section>
      ) : null}

      <div className={styles.detailGrid}>
        <TaskSessions sessions={detail.sessions} onCorrect={setCorrecting} />

        <section className={`${styles.detailSection} ${styles.detailCard}`} aria-labelledby="thoughts-title">
          <div className={styles.sectionTitleRow}>
            <span className={styles.sectionIcon}><Icon name="thought" width={19} height={19} /></span>
            <div><h2 id="thoughts-title">Thoughts</h2><p>{detail.thoughts.length === 0 ? "Notes connected to this task" : `${detail.thoughts.length} ${detail.thoughts.length === 1 ? "note" : "notes"}`}</p></div>
          </div>
          {detail.thoughts.length === 0 ? <div className={styles.sectionEmpty}><p>No related thoughts yet.</p><span>Capture one from Today whenever something clicks.</span></div> : (
            <ul className={styles.thoughtList}>{detail.thoughts.map((thought) => <li key={thought.id}><div className={styles.entryMeta}><time dateTime={thought.occurredAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(thought.occurredAt))}</time><FeelingNote value={thought.feeling} /></div><MarkdownContent>{thought.text}</MarkdownContent></li>)}</ul>
          )}
        </section>
      </div>

      <CarryForwardForm detail={detail} />

    </div>
    {conflictingSession ? <ActiveSessionConflictDialog
      target={task}
      activeSession={conflictingSession}
      busy={starting}
      onCancel={() => setConflictingSession(null)}
      onSwitch={() => void startOrResume({
        kind: "PAUSE_AND_SWITCH",
        activeSessionId: conflictingSession.id,
        activeTaskEtag: conflictingSession.task.etag,
      })}
    /> : null}
    {correcting ? <SessionCorrectionDialog session={correcting} onClose={() => setCorrecting(null)} onCorrected={() => { setCorrecting(null); load(); }} /> : null}
    </>
  );
}
