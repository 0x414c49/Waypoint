import { Button } from "../../ui/Button.js";
import type { SessionDetail } from "./types.js";
import styles from "./Journey.module.css";

function duration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

export function TaskSessions({ sessions, onCorrect }: { sessions: SessionDetail[]; onCorrect: (session: SessionDetail) => void }) {
  return (
    <section className={styles.detailSection} aria-labelledby="sessions-title">
      <h2 id="sessions-title">Sessions</h2>
      {sessions.length === 0 ? <p className={styles.muted}>No session time recorded yet.</p> : (
        <ul className={styles.sessionList}>
          {sessions.map((session) => (
            <li key={session.id}>
              <div>
                <time dateTime={session.startedAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(session.startedAt))}</time>
                <span>{session.endedAt ? duration(session.actualSecondsAtGeneratedAt) : "Running"}{session.correctedAt ? " · corrected" : ""}</span>
              </div>
              <Button variant="ghost" onClick={() => onCorrect(session)}>Correct time</Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
