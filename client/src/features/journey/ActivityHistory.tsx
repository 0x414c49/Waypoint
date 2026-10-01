import { useEffect, useRef } from "react";
import type { ActivityResponse } from "./types.js";
import styles from "./ActivityHistory.module.css";

function cellDuration(seconds: number): string {
  if (seconds === 0) return "no recorded session time";
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"} recorded`;
}

function totalDuration(seconds: number): string {
  const minutes = seconds === 0 ? 0 : Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${minutes} min`;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

function month(date: string): string {
  return new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00.000Z`));
}

function friendlyDate(date: string): string {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00.000Z`));
}

const legend = [
  { level: 0, label: "No recorded time" },
  { level: 1, label: "Under 15 minutes" },
  { level: 2, label: "15–29 minutes" },
  { level: 3, label: "30–59 minutes" },
  { level: 4, label: "60 minutes or more" },
];

export function ActivityHistory({ activity }: { activity: ActivityResponse }) {
  const scroller = useRef<HTMLDivElement>(null);
  const startDay = new Date(`${activity.from}T00:00:00.000Z`).getUTCDay();
  const weekCount = Math.ceil((startDay + activity.days.length) / 7);
  const totalSeconds = activity.days.reduce((total, day) => total + day.sessionSeconds, 0);
  const activeDays = activity.days.filter((day) => day.sessionSeconds > 0).length;
  const monthLabels = new Map<number, string>();
  activity.days.forEach((day, index) => {
    const date = new Date(`${day.date}T00:00:00.000Z`);
    let week = Math.floor((startDay + index) / 7);
    const usefulPartialMonth = index === 0 && date.getUTCDate() <= 14;
    if (usefulPartialMonth || date.getUTCDate() === 1) {
      while (monthLabels.has(week) && week < weekCount - 1) week += 1;
      monthLabels.set(week, month(day.date));
    }
  });

  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, [activity.from, activity.to]);

  return (
    <section className={styles.activity} aria-labelledby="journey-activity-title">
      <div className={styles.sectionHeading}>
        <div>
          <h2 id="journey-activity-title">Learning activity</h2>
          <p>Closed session time—quiet context, never a streak.</p>
        </div>
        <span>{friendlyDate(activity.from)} – {friendlyDate(activity.to)}</span>
      </div>

      <div className={styles.activitySummary} aria-label="Activity summary">
        <strong>{totalDuration(totalSeconds)} recorded</strong>
        <span>across {activeDays} {activeDays === 1 ? "learning day" : "learning days"}</span>
      </div>

      <div ref={scroller} className={styles.activityScroller} role="region" aria-label="Scrollable learning activity calendar" tabIndex={0}>
        <div className={styles.activityCalendar}>
          <div className={styles.activityDayLabels} aria-hidden="true">
            <span /> <span /> <span>Mon</span> <span /> <span>Wed</span> <span /> <span>Fri</span> <span />
          </div>
          <div className={styles.activityPlot}>
            <div className={styles.activityMonths} aria-hidden="true">
              {Array.from({ length: weekCount }, (_, week) => <span className={styles.activityMonth} key={week}>{monthLabels.get(week) ?? ""}</span>)}
            </div>
            <div className={styles.activityWeeks} role="list" aria-label={`${activity.days.length} days of recorded session activity`}>
              {Array.from({ length: startDay }, (_, index) => <span className={styles.activityEmptyCell} aria-hidden="true" key={`before-${index}`} />)}
              {activity.days.map((day) => {
                const description = `${friendlyDate(day.date)}: ${cellDuration(day.sessionSeconds)}`;
                return <span key={day.date} role="listitem" className={styles.activityCell} data-level={day.level} aria-label={description} title={description} />;
              })}
              {Array.from({ length: weekCount * 7 - startDay - activity.days.length }, (_, index) => <span className={styles.activityEmptyCell} aria-hidden="true" key={`after-${index}`} />)}
            </div>
          </div>
        </div>
      </div>
      <p className={styles.activityScrollHint}>Latest weeks shown. Scroll sideways for earlier months.</p>

      <div className={styles.activityLegend} aria-label="Session-time color scale">
        <span>Session time</span>
        <span className={styles.legendEdge}>0 min</span>
        {legend.map((item) => <span key={item.level} className={styles.activityCell} data-level={item.level} title={item.label} aria-hidden="true" />)}
        <span className={styles.legendEdge}>60+ min</span>
      </div>
    </section>
  );
}
