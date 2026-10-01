import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
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

function duration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function taskStatus(status: TaskDetail["task"]["status"]): string {
  return { NOT_STARTED: "Not started", IN_PROGRESS: "Running", PAUSED: "Paused", FINISHED: "Finished", SKIPPED: "Skipped" }[status];
}

export function TaskDetailPage() {
  const { taskId = "" } = useParams();
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [correcting, setCorrecting] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (error && !detail) return <section className={styles.errorPanel}><h1>Task could not open.</h1><p>{error}</p><Button onClick={() => { setError(null); load(); }}>Try again</Button></section>;
  if (!detail) return <p role="status" className={styles.muted}>Opening task history…</p>;

  const { task } = detail;
  const plan = task.displayPlan;
  const latestReview = detail.reviews.at(-1);
  return (
    <>
    <div className={styles.page} id="task-detail-content">
      <header className={styles.detailHeader}>
        <Link className={styles.backLink} to="/journey"><Icon name="back" width={16} height={16} />Back to Journey</Link>
        <div className={styles.entryMeta}><span>{taskStatus(task.status)}</span><span>{duration(task.timing.actualSecondsAtGeneratedAt)} recorded</span></div>
        <h1>{plan.title}</h1>
        <p>{plan.focusArea?.name ?? "Learning plan"} · planned {plan.plannedDate}</p>
        {task.displayPlanSource === "HISTORICAL" ? <p className={styles.historyNotice}>Showing the plan text captured when this work began.</p> : null}
        {plan.description ? <div className={styles.lead}><MarkdownContent>{plan.description}</MarkdownContent></div> : null}
        <DecisionContextAction task={task} />
      </header>

      {latestReview ? (
        <section className={styles.detailSection} aria-labelledby="outcome-title">
          <h2 id="outcome-title">Outcome</h2>
          <p><strong>{latestReview.outcome === "PARTIAL" ? "Made progress" : latestReview.outcome.replace("_", " ").toLowerCase()}</strong></p>
          {latestReview.keyLearning ? <blockquote><MarkdownContent>{latestReview.keyLearning}</MarkdownContent></blockquote> : null}
        </section>
      ) : null}

      <TaskSessions sessions={detail.sessions} onCorrect={setCorrecting} />

      <section className={styles.detailSection} aria-labelledby="thoughts-title">
        <h2 id="thoughts-title">Thoughts</h2>
        {detail.thoughts.length === 0 ? <p className={styles.muted}>No related thoughts yet.</p> : (
          <ul className={styles.thoughtList}>{detail.thoughts.map((thought) => <li key={thought.id}><div className={styles.entryMeta}><time dateTime={thought.occurredAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(thought.occurredAt))}</time><FeelingNote value={thought.feeling} /></div><MarkdownContent>{thought.text}</MarkdownContent></li>)}</ul>
        )}
      </section>

      <CarryForwardForm detail={detail} />

    </div>
    {correcting ? <SessionCorrectionDialog session={correcting} onClose={() => setCorrecting(null)} onCorrected={() => { setCorrecting(null); load(); }} /> : null}
    </>
  );
}
