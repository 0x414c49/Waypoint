import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "../../ui/Button.js";
import { QuarterApiError, downloadExport, exportQuarter, getQuarter, getQuarters } from "./api.js";
import type { QuarterDetail, QuarterSummary } from "./api.js";
import styles from "./Quarter.module.css";

function phaseLabel(phase: QuarterSummary["phase"]): string {
  if (phase === "FUTURE") return "Not started";
  if (phase === "PAST") return "Past Quarter";
  return "Current Quarter";
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
  const visibleError = error?.key === (quarterId ?? null) ? error.message : null;

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
        <header className={styles.heading}><p className={styles.eyebrow}>QUARTER</p><h1>Your learning plan</h1></header>
        <section className={styles.empty} aria-labelledby="empty-quarter-title">
          <h2 id="empty-quarter-title">No Quarter is loaded yet.</h2>
          <p>Bring in a plan when you’re ready. Preview shows what would change before anything is saved.</p>
          <Button variant="primary" onClick={() => navigate("/quarter/import")}>Import a learning plan</Button>
        </section>
      </div>
    );
  }

  const milestone = milestoneId ? quarter.milestones.find((item) => item.id === milestoneId) : undefined;
  const focusArea = focusAreaId ? quarter.focusAreas.find((item) => item.id === focusAreaId) : undefined;
  if ((milestoneId && !milestone) || (focusAreaId && !focusArea)) {
    return <section className={styles.empty}><h1>This plan item is no longer in the current plan.</h1><p>Historical work remains available in Journey with the plan context captured when it happened.</p><Link to={`/quarter/${encodeURIComponent(quarter.id)}`}>Return to Quarter</Link></section>;
  }
  const selectedTasks = quarter.tasks.filter((task) =>
    (focusAreaId ? task.focusAreaId === focusAreaId : true) && (milestoneId ? task.milestoneId === milestoneId : true));
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
        <p className={styles.eyebrow}>QUARTER · {phaseLabel(quarter.phase)}</p>
        <h1>{focusArea?.name ?? milestone?.title ?? quarter.title}</h1>
        {focusArea?.description ? <p className={styles.lead}>{focusArea.description}</p> : null}
        {milestone?.description ? <p className={styles.lead}>{milestone.description}</p> : null}
        <p>{quarter.startDate} – {quarter.endDate}</p>
        {between ? <p className={styles.quietNotice}>Between quarters. This plan remains available as the intent you set; nothing here implies unfinished debt.</p> : null}
        {quarter.phase === "FUTURE" ? <p className={styles.quietNotice}>This Quarter has not started yet. Your plan is ready when the dates arrive.</p> : null}
        {quarter.mantra ? <blockquote>{quarter.mantra}</blockquote> : null}
      </header>

      <div className={styles.actions}>
        {(focusAreaId || milestoneId) ? <Link to={`/quarter/${encodeURIComponent(quarter.id)}`}>← Back to Quarter</Link> : null}
        <Button variant="secondary" onClick={() => navigate(`/quarter/${encodeURIComponent(quarter.id)}/import`)}>Update plan</Button>
        <Button variant="secondary" onClick={handleExport}>Export YAML</Button>
        {quarters.length > 1 ? <label className={styles.quarterPicker}>Choose Quarter
          <select value={quarter.id} onChange={(event) => navigate(`/quarter/${encodeURIComponent(event.target.value)}`)}>
            {quarters.map((item) => <option key={item.id} value={item.id}>{item.title} · {phaseLabel(item.phase)}</option>)}
          </select>
        </label> : null}
      </div>
      {exportError ? <p className={styles.exportError} role="alert">{exportError} <Button variant="ghost" onClick={handleExport}>Try export again</Button></p> : null}

      {!focusAreaId && !milestoneId ? <>
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

      <section className={styles.section} aria-labelledby="planned-work-heading">
        <h2 id="planned-work-heading">{focusArea ? `Planned work in ${focusArea.name}` : milestone ? `Planned work in ${milestone.title}` : "Planned work"}</h2>
        {selectedTasks.length ? <ul className={styles.taskList}>{selectedTasks.map((task) => (
          <li key={task.id}>
            <time dateTime={task.plannedDate}>{task.plannedDate}</time>
            <Link to={`/tasks/${encodeURIComponent(task.id)}`}>{task.title}</Link>
            <span>{quarter.focusAreas.find((area) => area.id === task.focusAreaId)?.name ?? "Plan"} · {task.recommendationMode === "OPTIONAL" ? "Only if useful" : task.recommendationMode === "WHEN_CLEAR" ? "When clear" : "Planned"}</span>
          </li>
        ))}</ul> : <p className={styles.muted}>{focusArea || milestone ? "No current planned items in this section." : "This Quarter has no planned items yet."}</p>}
        {milestone ? <Link className={styles.summaryLink} to={`/quarters/${encodeURIComponent(quarter.id)}/milestones/${encodeURIComponent(milestone.id)}/summary`}>View what happened during this milestone</Link> : null}
      </section>
    </div>
  );
}
