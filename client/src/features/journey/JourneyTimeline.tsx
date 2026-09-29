import { Link } from "react-router-dom";
import type { JourneyItem } from "./types.js";
import { Button } from "../../ui/Button.js";
import styles from "./Journey.module.css";

function duration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function label(type: JourneyItem["type"]): string {
  switch (type) {
    case "THOUGHT": return "Thought";
    case "WEEKLY_REFLECTION": return "Weekly thought";
    case "SESSION": return "Session";
    case "TASK_FINISHED": return "Finished";
    case "DECISION_REVIEW": return "Decision review";
  }
}

function heading(item: JourneyItem): string {
  if (item.type === "SESSION" || item.type === "TASK_FINISHED") return item.task.title;
  if (item.type === "DECISION_REVIEW") return item.decision.title;
  return item.relatedTask?.title ?? item.relatedMilestone?.title ?? "A thought worth keeping";
}

export function JourneyTimeline({ items, onEdit, listLabel = "Journey entries" }: { items: JourneyItem[]; onEdit: (entry: Extract<JourneyItem, { type: "THOUGHT" | "WEEKLY_REFLECTION" }>) => void; listLabel?: string }) {
  return (
      <ol className={styles.timeline} aria-label={listLabel}>
      {items.map((item) => (
        <li key={`${item.type}-${item.id}`} className={styles.timelineItem}>
          <div className={styles.entryMeta}>
            <time dateTime={item.occurredAt}>
              {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.occurredAt))}
            </time>
            <span>{label(item.type)}</span>
            {(item.type === "THOUGHT" || item.type === "WEEKLY_REFLECTION") && item.changedMyMind ? <strong>Changed my mind</strong> : null}
          </div>
          <h2>{heading(item)}</h2>
          {item.type === "THOUGHT" || item.type === "WEEKLY_REFLECTION"
            ? <p className={styles.entryText}>{item.text}</p>
              : item.type === "DECISION_REVIEW"
                ? <p className={styles.entryText}>{item.notes ?? (item.outcome === "DEFERRED" ? `Review postponed${item.nextReviewDate ? ` until ${item.nextReviewDate}` : ""}.` : "Review recorded.")}</p>
              : item.type === "TASK_FINISHED" && item.keyLearning
              ? <p className={styles.entryText}>{item.keyLearning}</p>
              : null}
          <div className={styles.entryLinks}>
            {item.type === "SESSION" ? <span>{duration(item.seconds)} recorded</span> : null}
            {item.type === "SESSION" || item.type === "TASK_FINISHED"
              ? <Link to={`/tasks/${encodeURIComponent(item.task.id)}`}>View task</Link>
              : item.type === "DECISION_REVIEW"
                ? <Link to={`/decisions/${encodeURIComponent(item.decision.id)}`}>View decision</Link>
              : item.relatedTask
                ? <Link to={`/tasks/${encodeURIComponent(item.relatedTask.id)}`}>View task</Link>
                : null}
            {(item.type === "THOUGHT" || item.type === "WEEKLY_REFLECTION") && item.relatedMilestone
              ? <Link to={`/quarters/${encodeURIComponent(item.relatedMilestone.quarterId)}/milestones/${encodeURIComponent(item.relatedMilestone.id)}/summary`}>View {item.relatedMilestone.title}</Link>
              : null}
            {item.type === "THOUGHT" || item.type === "WEEKLY_REFLECTION" ? <Button variant="ghost" onClick={() => onEdit(item)}>Edit</Button> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
