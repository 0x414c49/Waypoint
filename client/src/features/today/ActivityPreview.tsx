import type { Dashboard } from "./types.js";
import styles from "./Today.module.css";

function duration(seconds: number): string {
  if (seconds === 0) return "no recorded time";
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

export function ActivityPreview({ activity }: { activity: Dashboard["activityPreview"] }) {
  return (
    <section className={styles.activity} aria-labelledby="activity-title">
      <div className={styles.sectionHeading}>
        <h2 id="activity-title">Recent activity</h2>
        <span>Recorded session time</span>
      </div>
      <div className={styles.activityGrid} role="list" aria-label="Last 14 days of recorded activity">
        {activity.days.map((day) => {
          const label = `${day.date}: ${duration(day.sessionSeconds)}`;
          return (
            <span
              className={styles.activityCell}
              data-level={day.level}
              key={day.date}
              role="listitem"
              aria-label={label}
              title={label}
            />
          );
        })}
      </div>
    </section>
  );
}
