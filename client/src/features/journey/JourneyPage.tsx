import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../ui/Button.js";
import { getDashboard } from "../today/api.js";
import { ActivityHistory } from "./ActivityHistory.js";
import { getActivity, getAllTasks, getJourney } from "./api.js";
import { JourneyFilters } from "./JourneyFilters.js";
import { JourneyEntryEditor } from "./JourneyEntryEditor.js";
import { JourneyTimeline } from "./JourneyTimeline.js";
import type { ActivityResponse, JourneyEntry, JourneyFilters as FilterValues, JourneyItem, TaskList } from "./types.js";
import styles from "./Journey.module.css";

function dateDaysBefore(end: string, days: number): string {
  const date = new Date(`${end}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function JourneyPage() {
  const [items, setItems] = useState<JourneyItem[]>([]);
  const [taskOptions, setTaskOptions] = useState<TaskList["items"]>([]);
  const [activity, setActivity] = useState<ActivityResponse | null>(null);
  const [filters, setFilters] = useState<FilterValues>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<JourneyEntry | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const load = useCallback((signal?: AbortSignal, cursor?: string) => {
    const activityRequest = cursor
      ? Promise.resolve(null)
      : getDashboard(signal).then((dashboard) => {
          const from = filters.from ?? dateDaysBefore(dashboard.today, 364);
          const to = filters.to ?? dashboard.today;
          return getActivity(from, to, signal);
        });
    void Promise.all([getJourney(filters, signal, cursor), activityRequest])
      .then(([journey, nextActivity]) => {
        setItems((current) => cursor ? [...current, ...journey.items] : journey.items);
        setNextCursor(journey.nextCursor);
        if (nextActivity) setActivity(nextActivity);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "Journey could not be opened.");
      })
      .finally(() => {
        if (!signal?.aborted) {
          setLoading(false);
          setLoadingMore(false);
        }
      });
  }, [filters]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    void getAllTasks(controller.signal).then(setTaskOptions).catch((caught: unknown) => {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "Task filters could not be opened.");
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const refresh = () => {
      setLoading(true);
      setError(null);
      load();
    };
    window.addEventListener("journey:entries-changed", refresh);
    return () => window.removeEventListener("journey:entries-changed", refresh);
  }, [load]);

  const tasks = useMemo(() => {
    const unique = new Map<string, string>();
    for (const task of taskOptions) unique.set(task.id, task.displayPlan.title);
    return [...unique].map(([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title));
  }, [taskOptions]);

  const milestones = useMemo(() => {
    const unique = new Map<string, string>();
    for (const task of taskOptions) {
      const milestone = task.displayPlan.milestone;
      if (milestone) unique.set(milestone.id, milestone.title);
    }
    return [...unique].map(([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title));
  }, [taskOptions]);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeading}>
        <div>
          <h1 ref={titleRef} id="journey-page-title" tabIndex={-1}>Journey</h1>
          <p>The record of what you noticed and changed.</p>
        </div>
        <Button variant="secondary" onClick={() => window.dispatchEvent(new Event("journey:open-thought"))}>+ Thought</Button>
      </header>
      <JourneyFilters filters={filters} tasks={tasks} milestones={milestones} onChange={(next) => {
        setLoading(true);
        setError(null);
        setNotice(null);
        setFilters(next);
      }} />
      {notice ? <p className={styles.muted} role="status">{notice}</p> : null}
      {error ? (
        <div className={styles.errorPanel} role="alert">
          <p>{error}</p>
          <Button onClick={() => { setLoading(true); setError(null); load(); }}>Try again</Button>
        </div>
      ) : null}
      {activity ? <ActivityHistory activity={activity} /> : null}
      {loading ? <p role="status" className={styles.muted}>Opening your Journey…</p> : null}
      {!loading && !error && items.length === 0 ? (
        <section className={styles.empty}>
          <h2>No entries here yet.</h2>
          <p>Thoughts, sessions, and outcomes will appear naturally as you use Today.</p>
        </section>
      ) : null}
      {!loading && items.length > 0 ? <JourneyTimeline items={items} onEdit={setEditing} /> : null}
      {nextCursor ? <Button variant="secondary" disabled={loadingMore} onClick={() => { setLoadingMore(true); setError(null); load(undefined, nextCursor); }}>{loadingMore ? "Loading…" : "Load more"}</Button> : null}
      {editing ? <JourneyEntryEditor entry={editing} focusFallbackSelector="#journey-page-title" onClose={() => setEditing(null)} onSaved={(updated) => {
        setItems((current) => current.map((item) => item.type !== "SESSION" && item.type !== "TASK_FINISHED" && item.id === updated.id ? updated : item));
        setEditing(null);
      }} onDeleted={(entryId) => {
        setItems((current) => current.filter((item) =>
          (item.type !== "THOUGHT" && item.type !== "WEEKLY_REFLECTION") || item.id !== entryId,
        ));
        setEditing(null);
        setNotice("Thought removed from Journey.");
      }} /> : null}
    </div>
  );
}
