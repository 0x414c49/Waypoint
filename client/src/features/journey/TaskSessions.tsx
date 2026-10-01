import { Button } from "../../ui/Button.js";
import { Icon } from "../../ui/Icon.js";
import type { SessionDetail } from "./types.js";
import styles from "./Journey.module.css";

function duration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

export function TaskSessions({ sessions, onCorrect }: { sessions: SessionDetail[]; onCorrect: (session: SessionDetail) => void }) {
  return (
    <section className={`${styles.detailSection} ${styles.detailCard}`} aria-labelledby="sessions-title">
      <div className={styles.sectionTitleRow}>
        <span className={styles.sectionIcon}><Icon name="clock" width={19} height={19} /></span>
        <div><h2 id="sessions-title">Sessions</h2><p>{sessions.length === 0 ? "Your time log" : `${sessions.length} ${sessions.length === 1 ? "session" : "sessions"}`}</p></div>
      </div>
      {sessions.length === 0 ? <div className={styles.sectionEmpty}><p>No session time recorded yet.</p><span>Start this task from Today and your time will appear here.</span></div> : (
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
