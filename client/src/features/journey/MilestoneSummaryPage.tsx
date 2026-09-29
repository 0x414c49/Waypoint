import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "../../ui/Button.js";
import { JourneyEntryEditor } from "./JourneyEntryEditor.js";
import { createJourneyEntry, getMilestoneSummary } from "./api.js";
import type { MilestoneSummary } from "./types.js";
import styles from "./Journey.module.css";

function duration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function statusLabel(status: MilestoneSummary["taskRows"][number]["currentStatus"]): string {
  return status.replaceAll("_", " ").toLowerCase();
}

export function MilestoneSummaryPage() {
  const { quarterId = "", milestoneId = "" } = useParams();
  const [summary, setSummary] = useState<MilestoneSummary | null>(null);
  const [reflection, setReflection] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingReflection, setEditingReflection] = useState(false);
  const reflectionHeadingRef = useRef<HTMLHeadingElement>(null);

  const load = useCallback((signal?: AbortSignal) => {
    void getMilestoneSummary(quarterId, milestoneId, signal).then(setSummary).catch((caught: unknown) => {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "This summary could not be opened.");
    });
  }, [milestoneId, quarterId]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const saveReflection = async () => {
    if (!summary || !reflection.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createJourneyEntry({ text: reflection.trim(), relatedTaskId: null, relatedMilestoneId: summary.milestone.id });
      setReflection("");
      load();
      window.dispatchEvent(new Event("journey:entries-changed"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The weekly thought could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  if (error && !summary) return <section className={styles.errorPanel}><h1>Summary could not open.</h1><p>{error}</p><Button onClick={() => { setError(null); load(); }}>Try again</Button></section>;
  if (!summary) return <p role="status" className={styles.muted}>Generating the summary…</p>;

  return (
    <div className={styles.page}>
      <header className={styles.detailHeader}>
        <Link to="/journey">← Journey</Link>
        <p className={styles.eyebrow}>{summary.milestone.startDate}–{summary.milestone.endDate}</p>
        <h1>{summary.milestone.title}</h1>
        <p>Here’s how this part of the journey unfolded.</p>
        {summary.milestone.displaySource === "HISTORICAL" ? <p className={styles.historyNotice}>This heading comes from the plan captured during the work.</p> : null}
      </header>

      <section className={styles.facts} aria-label="Generated summary facts">
        <div><strong>{summary.counts.finished}</strong><span>finished</span></div>
        <div><strong>{summary.counts.open}</strong><span>still open</span></div>
        <div><strong>{duration(summary.effortDuringPeriod.sessionSeconds)}</strong><span>recorded</span></div>
        <div><strong>{summary.thoughts.length}</strong><span>thoughts</span></div>
      </section>

      <section className={styles.detailSection} aria-labelledby="period-events-title">
        <h2 id="period-events-title">During this period</h2>
        <p>
          {summary.eventsDuringPeriod.finished} finished · {summary.eventsDuringPeriod.skipped} skipped · {summary.eventsDuringPeriod.reopened} reopened · {summary.eventsDuringPeriod.thoughtsCaptured} thoughts captured
        </p>
      </section>

      <section className={styles.detailSection} aria-labelledby="week-items-title">
        <h2 id="week-items-title">What happened</h2>
        <ul className={styles.taskRows}>
          {summary.taskRows.map((row) => (
            <li key={row.task.id}>
              <time dateTime={row.task.displayPlan.plannedDate}>{row.task.displayPlan.plannedDate}</time>
              <Link to={`/tasks/${encodeURIComponent(row.task.id)}`}>{row.task.displayPlan.title}</Link>
              <span>
                {statusLabel(row.statusAtPeriodEnd)} at period end
                {row.currentStatus !== row.statusAtPeriodEnd ? ` · now ${statusLabel(row.currentStatus)}` : ""}
              </span>
              <span>{row.actualSecondsAllTime ? duration(row.actualSecondsAllTime) : "—"}</span>
            </li>
          ))}
        </ul>
      </section>

      {summary.openWork.length ? (
        <section className={styles.detailSection} aria-labelledby="open-work-title">
          <h2 id="open-work-title">Still open</h2>
          {summary.openWork.map((task) => <p key={task.id}><Link to={`/tasks/${encodeURIComponent(task.id)}`}>{task.displayPlan.title}</Link> · your place is saved</p>)}
        </section>
      ) : null}

      <section className={styles.reflection} aria-labelledby="weekly-thought-title">
        <h2 ref={reflectionHeadingRef} id="weekly-thought-title" tabIndex={-1}>Optional weekly thought</h2>
        {summary.reflection.entry ? (
          <>
            <blockquote>{summary.reflection.entry.text}</blockquote>
            <Button variant="secondary" onClick={() => setEditingReflection(true)}>Edit weekly thought</Button>
          </>
        ) : (
          <>
            <label className={styles.fieldLabel}>
              {summary.reflection.prompt ?? "What should the next part of the journey remember?"}
              <textarea value={reflection} onChange={(event) => setReflection(event.target.value)} />
            </label>
            <Button variant="primary" disabled={busy || !reflection.trim()} onClick={() => void saveReflection()}>{busy ? "Saving…" : "Save thought"}</Button>
          </>
        )}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
      </section>
      {editingReflection && summary.reflection.entry ? (
        <JourneyEntryEditor
          entry={summary.reflection.entry}
          focusFallbackSelector="#weekly-thought-title"
          onClose={() => setEditingReflection(false)}
          onSaved={() => { setEditingReflection(false); load(); }}
          onDeleted={() => {
            const deleted = summary.reflection.entry;
            if (!deleted) return;
            setEditingReflection(false);
            setSummary((current) => current ? {
              ...current,
              thoughts: current.thoughts.filter((thought) => thought.id !== deleted.id),
              changedMyMindCount: Math.max(0, current.changedMyMindCount - (deleted.changedMyMind ? 1 : 0)),
              eventsDuringPeriod: {
                ...current.eventsDuringPeriod,
                thoughtsCaptured: Math.max(0, current.eventsDuringPeriod.thoughtsCaptured - 1),
              },
              reflection: { ...current.reflection, entry: null },
            } : current);
            load();
          }}
        />
      ) : null}
    </div>
  );
}
