import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "../../ui/Button.js";
import { Icon } from "../../ui/Icon.js";
import { getDashboard } from "../today/api.js";
import { QuarterApiError, downloadExport, exportQuarter, getQuarter, getQuarters } from "./api.js";
import type { QuarterDetail, QuarterSummary } from "./api.js";
import styles from "./Quarter.module.css";

type ScheduleTask = QuarterDetail["tasks"][number];
interface ScheduleWeek {
  key: string;
  startDate: string;
  endDate: string;
  tasks: ScheduleTask[];
  milestoneNames: string[];
}

function phaseLabel(phase: QuarterSummary["phase"]): string {
  if (phase === "FUTURE") return "Not started";
  if (phase === "PAST") return "Past quarter";
  return "Current quarter";
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function weekStart(date: string): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
  return value.toISOString().slice(0, 10);
}

function dateLabel(date: string, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }): string {
  return new Intl.DateTimeFormat(undefined, { ...options, timeZone: "UTC" }).format(new Date(`${date}T12:00:00.000Z`));
}

function groupSchedule(tasks: ScheduleTask[], quarter: QuarterDetail): ScheduleWeek[] {
  const byWeek = new Map<string, ScheduleTask[]>();
  const firstWeek = weekStart(quarter.startDate);
  const lastWeek = weekStart(quarter.endDate);
  const weekCount = Math.floor((Date.parse(`${lastWeek}T00:00:00.000Z`) - Date.parse(`${firstWeek}T00:00:00.000Z`)) / (7 * 24 * 60 * 60 * 1000));
  for (let index = 0; index <= weekCount; index += 1) byWeek.set(shiftDate(firstWeek, index * 7), []);
  for (const task of tasks) {
    const key = weekStart(task.plannedDate);
    const rows = byWeek.get(key) ?? [];
    rows.push(task);
    byWeek.set(key, rows);
  }
  return [...byWeek].sort(([left], [right]) => left.localeCompare(right)).map(([key, rows]) => {
    const weekEnd = shiftDate(key, 6);
    return {
      key,
      startDate: key < quarter.startDate ? quarter.startDate : key,
      endDate: weekEnd > quarter.endDate ? quarter.endDate : weekEnd,
      tasks: rows,
      milestoneNames: quarter.milestones.filter((milestone) => milestone.startDate <= weekEnd && milestone.endDate >= key).map((milestone) => milestone.title),
    };
  });
}

function tasksByDay(tasks: ScheduleTask[]): Array<[string, ScheduleTask[]]> {
  const byDay = new Map<string, ScheduleTask[]>();
  for (const task of tasks) {
    const rows = byDay.get(task.plannedDate) ?? [];
    rows.push(task);
    byDay.set(task.plannedDate, rows);
  }
  return [...byDay].sort(([left], [right]) => left.localeCompare(right));
}

function daysInWeek(week: ScheduleWeek): Array<[string, ScheduleTask[]]> {
  const tasks = new Map(tasksByDay(week.tasks));
  return Array.from({ length: 7 }, (_, offset) => {
    const date = shiftDate(week.startDate, offset);
    return date <= week.endDate ? [date, tasks.get(date) ?? []] as [string, ScheduleTask[]] : null;
  }).filter((item): item is [string, ScheduleTask[]] => item !== null);
}

export function QuarterPage() {
  const { quarterId, focusAreaId, milestoneId } = useParams();
  const navigate = useNavigate();
  const [quarters, setQuarters] = useState<QuarterSummary[]>([]);
  const [quarter, setQuarter] = useState<QuarterDetail | null>(null);
  const [loadedQuarterId, setLoadedQuarterId] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState<{ key: string | null; message: string } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [today, setToday] = useState<string | null>(null);
  const [view, setView] = useState<"schedule" | "details">("schedule");
  const visibleError = error?.key === (quarterId ?? null) ? error.message : null;

  useEffect(() => {
    const controller = new AbortController();
    void getDashboard(controller.signal).then(({ today: todayDate }) => setToday(todayDate)).catch(() => undefined);
    return () => controller.abort();
  }, []);

  const loadList = useCallback((signal?: AbortSignal) => {
    void getQuarters(signal).then(({ items }) => {
      setQuarters(items);
      if (!quarterId && items.length) navigate(`/quarter/${encodeURIComponent(items[0]!.id)}`, { replace: true });
    }).catch((caught: unknown) => {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError({ key: null, message: caught instanceof Error ? caught.message : "The Quarter list could not be opened." });
    }).finally(() => setLoadingList(false));
  }, [navigate, quarterId]);

  useEffect(() => {
    if (quarterId) return;
    const controller = new AbortController();
    loadList(controller.signal);
    return () => controller.abort();
  }, [loadList, quarterId]);

  useEffect(() => {
    if (!quarterId) return;
    const controller = new AbortController();
    void Promise.all([getQuarter(quarterId, controller.signal), getQuarters(controller.signal)])
      .then(([detail, list]) => { setQuarter(detail); setLoadedQuarterId(quarterId); setQuarters(list.items); })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError({ key: quarterId, message: caught instanceof QuarterApiError && caught.problem.code === "RESOURCE_NOT_FOUND"
          ? "That Quarter is not available in this private workspace."
          : caught instanceof Error ? caught.message : "The Quarter could not be opened." });
      })
    return () => controller.abort();
  }, [quarterId]);

  const loading = quarterId ? loadedQuarterId !== quarterId && !visibleError : loadingList;
  if (loading) return <p className={styles.muted} role="status">Opening your Quarter…</p>;
  if (visibleError) return <section className={styles.empty}><h1>Quarter could not open.</h1><p role="alert">{visibleError}</p><Button onClick={() => { setError(null); if (quarterId) { const controller = new AbortController(); void getQuarter(quarterId, controller.signal).then((detail) => { setQuarter(detail); setLoadedQuarterId(quarterId); }).catch((caught: unknown) => setError({ key: quarterId, message: caught instanceof Error ? caught.message : "Try again." })); } else { setLoadingList(true); loadList(); } }}>Try again</Button></section>;

  if (!quarterId || !quarter) {
    if (quarters.length) return <p className={styles.muted} role="status">Opening the latest Quarter…</p>;
    return (
      <div className={styles.page}>
          <header className={styles.heading}><p className={styles.eyebrow}>Quarter schedule</p><h1>Your learning plan</h1></header>
        <section className={styles.empty} aria-labelledby="empty-quarter-title">
          <h2 id="empty-quarter-title">No Quarter is loaded yet.</h2>
          <p>Your week-by-week learning schedule will appear here. Bring in a plan to get started.</p>
          <Button variant="primary" onClick={() => navigate("/quarter/import")}>Add a learning plan</Button>
        </section>
      </div>
    );
  }

  const milestone = milestoneId ? quarter.milestones.find((item) => item.id === milestoneId) : undefined;
  const focusArea = focusAreaId ? quarter.focusAreas.find((item) => item.id === focusAreaId) : undefined;
  const currentView = focusAreaId || milestoneId ? "schedule" : view;
  if ((milestoneId && !milestone) || (focusAreaId && !focusArea)) {
    return <section className={styles.empty}><h1>This plan item is no longer in the current plan.</h1><p>Historical work remains available in Journey with the plan context captured when it happened.</p><Link to={`/quarter/${encodeURIComponent(quarter.id)}`}>Return to Quarter</Link></section>;
  }
  const selectedTasks = quarter.tasks.filter((task) =>
    (focusAreaId ? task.focusAreaId === focusAreaId : true) && (milestoneId ? task.milestoneId === milestoneId : true));
  const weeks = groupSchedule(selectedTasks, quarter);
  const activeWeek = today ? weeks.findIndex((week) => today >= week.startDate && today <= week.endDate) : -1;
  const initiallyOpenWeek = activeWeek >= 0 ? activeWeek : quarter.phase === "PAST" ? weeks.length - 1 : 0;
  const quarterOptions = [...quarters].sort((left, right) => {
    const rank = { CURRENT: 0, PAST: 1, FUTURE: 2 } as const;
    const phaseOrder = rank[left.phase] - rank[right.phase];
    if (phaseOrder !== 0) return phaseOrder;
    return left.phase === "PAST" ? right.startDate.localeCompare(left.startDate) : left.startDate.localeCompare(right.startDate);
  });
  const anyCurrentQuarter = quarters.some((item) => item.phase === "CURRENT");
  const between = !anyCurrentQuarter && (quarter.phase === "PAST" || (quarter.phase === "FUTURE" && quarters.some((item) => item.phase === "PAST")));
  const handleExport = () => {
    setExportError(null);
    void exportQuarter(quarter.id)
      .then(({ blob, filename }) => downloadExport(blob, filename))
      .catch((caught: unknown) => setExportError(caught instanceof Error ? caught.message : "The plan export could not be downloaded."));
  };

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <p className={styles.eyebrow}>Quarter · {phaseLabel(quarter.phase)}</p>
        <h1>{focusArea?.name ?? milestone?.title ?? quarter.title}</h1>
        {focusArea?.description ? <p className={styles.lead}>{focusArea.description}</p> : null}
        {milestone?.description ? <p className={styles.lead}>{milestone.description}</p> : null}
        <p>{quarter.startDate} – {quarter.endDate}</p>
        {between ? <p className={styles.quietNotice}>Between quarters. This plan remains available as the intent you set; nothing here implies unfinished debt.</p> : null}
        {quarter.phase === "FUTURE" ? <p className={styles.quietNotice}>This Quarter has not started yet. Your plan is ready when the dates arrive.</p> : null}
        {quarter.mantra ? <blockquote>{quarter.mantra}</blockquote> : null}
      </header>

      <div className={styles.quarterControls}>
        {!focusAreaId && !milestoneId ? <div className={styles.viewSwitch} role="group" aria-label="Quarter view">
          <Button variant={view === "schedule" ? "primary" : "secondary"} aria-pressed={view === "schedule"} onClick={() => setView("schedule")}>Schedule</Button>
          <Button variant={view === "details" ? "primary" : "secondary"} aria-pressed={view === "details"} onClick={() => setView("details")}>Plan details</Button>
        </div> : null}
        <div className={styles.actions}>
          {(focusAreaId || milestoneId) ? <Link className={styles.backLink} to={`/quarter/${encodeURIComponent(quarter.id)}`}><Icon name="back" width={16} height={16} />Back to Quarter</Link> : null}
          <label className={styles.quarterPicker}>Quarter history
            <select aria-label="Choose quarter" value={quarter.id} disabled={quarters.length < 2} onChange={(event) => navigate(`/quarter/${encodeURIComponent(event.target.value)}`)}>
              {(["CURRENT", "PAST", "FUTURE"] as const).map((phase) => {
                const items = quarterOptions.filter((item) => item.phase === phase);
                return items.length ? <optgroup key={phase} label={{ CURRENT: "Current quarter", PAST: "Previous quarters", FUTURE: "Upcoming quarters" }[phase]}>{items.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</optgroup> : null;
              })}
            </select>
          </label>
          <Button variant="secondary" onClick={() => navigate(`/quarter/${encodeURIComponent(quarter.id)}/import`)}>Update plan</Button>
          <Button variant="secondary" onClick={handleExport}>Export plan</Button>
        </div>
      </div>
      {exportError ? <p className={styles.exportError} role="alert">{exportError} <Button variant="ghost" onClick={handleExport}>Try export again</Button></p> : null}

      {currentView === "details" ? <>
        <section className={styles.section} aria-labelledby="criteria-heading">
          <h2 id="criteria-heading">What would make this Quarter worthwhile</h2>
          {quarter.successCriteria.length ? <ol className={styles.criteria}>{quarter.successCriteria.map((criterion) => <li key={criterion.id}>{criterion.text}</li>)}</ol> : <p className={styles.muted}>No success criteria were set for this Quarter.</p>}
        </section>
        <section className={styles.section} aria-labelledby="focus-heading">
          <h2 id="focus-heading">Focus areas</h2>
          {quarter.focusAreas.length ? <ul className={styles.planLinks}>{quarter.focusAreas.map((area) => (
            <li key={area.id}><Link to={`/quarter/${encodeURIComponent(quarter.id)}/focus-areas/${encodeURIComponent(area.id)}`}>{area.name}</Link>{area.description ? <p>{area.description}</p> : null}</li>
          ))}</ul> : <p className={styles.muted}>No focus areas are defined yet.</p>}
        </section>
        <section className={styles.section} aria-labelledby="milestones-heading">
          <h2 id="milestones-heading">Milestones</h2>
          {quarter.milestones.length ? <ul className={styles.planLinks}>{quarter.milestones.map((item) => (
            <li key={item.id}>
              <Link to={`/quarter/${encodeURIComponent(quarter.id)}/milestones/${encodeURIComponent(item.id)}`}>{item.title}</Link>
              <span>{item.startDate} – {item.endDate} · {item.mode.toLowerCase()} · {item.taskCount} planned {item.taskCount === 1 ? "item" : "items"}</span>
            </li>
          ))}</ul> : <p className={styles.muted}>No milestones are defined yet.</p>}
        </section>
      </> : null}

      {currentView === "schedule" ? <section className={styles.schedule} aria-labelledby="schedule-heading">
        <div className={styles.scheduleHeader}>
          <div><h2 id="schedule-heading">{focusArea ? `${focusArea.name} schedule` : milestone ? `${milestone.title} schedule` : "Schedule"}</h2><p>Learning plan items, grouped by week.</p></div>
          <span>{selectedTasks.length} planned {selectedTasks.length === 1 ? "item" : "items"}</span>
        </div>
        {weeks.length ? <div className={styles.scheduleWeeks}>
          {weeks.map((week, index) => {
            const isThisWeek = index === activeWeek;
            return <details className={styles.scheduleWeek} key={week.key} open={index === initiallyOpenWeek}>
              <summary>
                <span className={styles.weekDate}>{dateLabel(week.startDate)}–{dateLabel(week.endDate, { month: "short", day: "numeric", year: "numeric" })}</span>
                <span className={styles.weekTitle}>{week.milestoneNames.join(" · ") || (week.startDate === quarter.startDate ? "Quarter opens" : "Planned learning")}</span>
                {isThisWeek ? <span className={styles.thisWeek}>This week</span> : null}
                <span className={styles.weekCount}>{week.tasks.length} {week.tasks.length === 1 ? "item" : "items"}</span>
              </summary>
              <div className={styles.weekBody}>
                {daysInWeek(week).map(([date, dayTasks]) => <div className={styles.scheduleDay} key={date}>
                  <time dateTime={date}>{dateLabel(date, { weekday: "short", month: "short", day: "numeric" })}</time>
                  {dayTasks.length ? <ul>{dayTasks.map((task) => <li key={task.id}>
                    <Link to={`/tasks/${encodeURIComponent(task.id)}`}>{task.title}</Link>
                    <span>{quarter.focusAreas.find((area) => area.id === task.focusAreaId)?.name ?? "Plan"} · {task.recommendationMode === "OPTIONAL" ? "Only if useful" : task.recommendationMode === "WHEN_CLEAR" ? "When clear" : "Planned"}</span>
                  </li>)}</ul> : <p className={styles.scheduleEmptyDay}>Nothing in the learning plan.</p>}
                </div>)}
              </div>
            </details>;
          })}
        </div> : <p className={styles.muted}>{focusArea || milestone ? "No learning items are planned here." : "No learning items are planned for this Quarter yet."}</p>}
        {milestone ? <Link className={styles.summaryLink} to={`/quarters/${encodeURIComponent(quarter.id)}/milestones/${encodeURIComponent(milestone.id)}/summary`}>View what happened during this milestone</Link> : null}
      </section> : null}
    </div>
  );
}
