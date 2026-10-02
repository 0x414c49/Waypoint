import { Button } from "../../ui/Button.js";
import { Link } from "react-router-dom";
import type { Dashboard, TaskProjection } from "./types.js";
import styles from "./Today.module.css";

interface TodayContextProps {
  upNext: Dashboard["upNext"];
  optionalToday: Dashboard["optionalToday"];
  leftovers: Dashboard["leftovers"];
  busy: boolean;
  onOpen: (task: TaskProjection) => void;
}

function ContextRow({
  label,
  task,
  detail,
  busy,
  onOpen,
}: {
  label: string;
  task: TaskProjection;
  detail?: string;
  busy: boolean;
  onOpen: (task: TaskProjection) => void;
}) {
  return (
    <div className={styles.contextRow}>
      <div>
        <p className={styles.contextLabel}>{label}</p>
        <h3>{task.displayPlan.title}</h3>
        {detail ? <p>{detail}</p> : null}
      </div>
      <Button variant="ghost" disabled={busy} onClick={() => onOpen(task)}>
        {task.status === "PAUSED" ? "Resume instead" : "Start instead"}
      </Button>
    </div>
  );
}

export function TodayContext({ upNext, optionalToday, leftovers, busy, onOpen }: TodayContextProps) {
  if (!upNext && !optionalToday && leftovers.totalCount === 0) return null;
  return (
    <section className={styles.context} aria-label="Today context">
      {upNext ? (
        <ContextRow
          label="Up next"
          task={upNext.task}
          {...(upNext.remainingTodayCount > 0
            ? { detail: `${upNext.remainingTodayCount} more planned today` }
            : {})}
          busy={busy}
          onOpen={onOpen}
        />
      ) : null}
      {optionalToday ? (
        <ContextRow
          label={optionalToday.label}
          task={optionalToday.task}
          busy={busy}
          onOpen={onOpen}
        />
      ) : null}
      {leftovers.totalCount > 0 ? <details className={styles.leftovers}>
        <summary>Leftover items <span>({leftovers.totalCount})</span></summary>
        <p>Choose one if useful. These remain on their original planned dates.</p>
        {leftovers.items.map((task) => <ContextRow
          key={task.id}
          label="Earlier plan"
          task={task}
          detail={`Planned ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${task.displayPlan.plannedDate}T12:00:00.000Z`))}`}
          busy={busy}
          onOpen={onOpen}
        />)}
        {leftovers.totalCount > leftovers.items.length ? <Link to="/quarter">See all in Quarter</Link> : null}
      </details> : null}
    </section>
  );
}
