import type { ActivityResponse } from "./types.js";
import styles from "./Journey.module.css";

function duration(seconds: number): string {
  if (seconds === 0) return "no recorded session time";
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"} recorded`;
}

export function ActivityHistory({ activity }: { activity: ActivityResponse }) {
  return (
    <section className={styles.activity} aria-labelledby="journey-activity-title">
      <div className={styles.sectionHeading}>
        <div>
          <h2 id="journey-activity-title">Activity context</h2>
          <p>Closed session time, shown as context rather than a target.</p>
        </div>
        <span>{activity.from}–{activity.to}</span>
      </div>
      <div className={styles.activityScroller}>
        <div className={styles.activityGrid} role="list" aria-label="Recorded session activity">
          {activity.days.map((day) => {
            const description = `${day.date}: ${duration(day.sessionSeconds)}`;
            return <span key={day.date} role="listitem" className={styles.activityCell} data-level={day.level} aria-label={description} title={description} />;
          })}
        </div>
      </div>
    </section>
  );
}
