import { Button } from "../../ui/Button.js";
import type { Dashboard, TaskProjection } from "./types.js";
import styles from "./Today.module.css";

interface TodayContextProps {
  upNext: Dashboard["upNext"];
  optionalToday: Dashboard["optionalToday"];
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

export function TodayContext({ upNext, optionalToday, busy, onOpen }: TodayContextProps) {
  if (!upNext && !optionalToday) return null;
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
    </section>
  );
}
