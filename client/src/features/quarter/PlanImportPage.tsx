import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "../../ui/Button.js";
import { QuarterApiError, applyPlan, previewPlan } from "./api.js";
import type { PlanPreview } from "./api.js";
import styles from "./Quarter.module.css";

function valueText(value: unknown): string {
  if (value === undefined) return "(not set)";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function friendlyError(error: unknown): string {
  if (!(error instanceof QuarterApiError)) return error instanceof Error ? error.message : "The plan could not be processed.";
  return error.problem.detail ?? "The plan could not be processed.";
}

export function PlanImportPage() {
  const { quarterId } = useParams();
  const navigate = useNavigate();
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState<PlanPreview | null>(null);
  const [acknowledged, setAcknowledged] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const handleFile = async (file?: File) => {
    if (!file) return;
    setContent(await file.text());
    setPreview(null);
    setAcknowledged([]);
    setError(null);
    setValidationErrors([]);
  };

  const makePreview = async () => {
    if (!content.trim()) { setError("Choose a YAML file or paste a learning plan first."); return; }
    setBusy(true); setError(null); setValidationErrors([]); setPreview(null); setAcknowledged([]);
    try { setPreview(await previewPlan(content)); }
    catch (caught) {
      setError(friendlyError(caught));
      if (caught instanceof QuarterApiError && caught.problem.errors) setValidationErrors(caught.problem.errors);
    } finally { setBusy(false); }
  };

  const apply = async () => {
    if (!preview || preview.requiredAcknowledgements.some((item) => !acknowledged.includes(item.id))) return;
    setBusy(true); setError(null);
    try {
      const result = await applyPlan(preview, acknowledged);
      window.dispatchEvent(new Event("journey:plan-applied"));
      navigate(`/quarter/${encodeURIComponent(result.quarterId)}`, { replace: true });
    } catch (caught) {
      setError(friendlyError(caught));
      if (caught instanceof QuarterApiError && caught.problem.requiredAcknowledgements) {
        setPreview((current) => current ? { ...current, requiredAcknowledgements: caught.problem.requiredAcknowledgements! } : current);
      }
    } finally { setBusy(false); }
  };

  const backTo = quarterId ? `/quarter/${encodeURIComponent(quarterId)}` : "/quarter";
  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <Link to={backTo}>← Back to Quarter</Link>
        <p className={styles.eyebrow}>PLAN · PRIVATE TO THIS DEVICE</p>
        <h1>{quarterId ? "Update your plan" : "Bring in a learning plan"}</h1>
        <p>Preview first. Import changes planned intent only; Sessions, reflections, Decisions, outcomes, and captured history stay as they are.</p>
      </header>

      <section className={styles.section} aria-labelledby="plan-source-heading">
        <h2 id="plan-source-heading">Version 1 YAML plan</h2>
        <label className={styles.fileLabel}>
          Choose a YAML file
          <input type="file" accept=".yaml,.yml,text/yaml,application/yaml" onChange={(event) => void handleFile(event.target.files?.[0])} />
        </label>
        <label className={styles.yamlLabel}>
          Plan content
          <textarea spellCheck={false} value={content} onChange={(event) => { setContent(event.target.value); setPreview(null); setAcknowledged([]); }} placeholder={'version: 1\nquarter:\n  id: q4-2026\n  title: Q4 2026\n  start: 2026-10-01\n  end: 2026-12-31\nfocusAreas: []\nmilestones: []\ntasks: []'} />
        </label>
        <Button variant="primary" disabled={busy || !content.trim()} onClick={() => void makePreview()}>{busy ? "Checking plan…" : "Validate and preview"}</Button>
      </section>

      {error ? <div className={styles.errorPanel} role="alert"><strong>Plan action could not continue.</strong><p>{error}</p>{validationErrors.length ? <ul>{validationErrors.map((item) => <li key={item}>{item}</li>)}</ul> : null}</div> : null}

      {preview ? <section className={styles.preview} aria-labelledby="preview-heading" aria-live="polite">
        <p className={styles.eyebrow}>{preview.mode === "CREATE_QUARTER" ? "CREATE QUARTER" : "UPDATE QUARTER"} · REVISION {preview.basePlanRevision ?? "NEW"}</p>
        <h2 id="preview-heading">Review before applying</h2>
        <p>{preview.mode === "CREATE_QUARTER" ? "This will create a Quarter and its plan records." : "Only current plan intent changes. Execution history and immutable snapshots will not be rewritten."} Imported Tasks start Not started; planned dates do not imply completed work.</p>
        <dl className={styles.summary}>
          <div><dt>Added</dt><dd>{preview.summary.added}</dd></div>
          <div><dt>Changed</dt><dd>{preview.summary.changed}</dd></div>
          <div><dt>Removed from plan</dt><dd>{preview.summary.removed}</dd></div>
          <div><dt>History preserved</dt><dd>{preview.summary.historicalPreserved}</dd></div>
          <div><dt>Active work to preserve</dt><dd>{preview.summary.conflicts}</dd></div>
        </dl>
        {preview.changes.length ? <ul className={styles.changes} aria-label="Plan semantic diff">
          {preview.changes.map((change, index) => <li key={`${change.entityType}-${change.id}-${index}`}>
            <div className={styles.changeHeading}><strong>{change.label}</strong><span>{change.kind.replaceAll("_", " ")}</span></div>
            <p>{change.explanation}</p>
            {change.before || change.after ? <details><summary>See plan details</summary>
              {change.before ? <p><strong>Before:</strong> {valueText(change.before)}</p> : null}
              {change.after ? <p><strong>After:</strong> {valueText(change.after)}</p> : null}
            </details> : null}
          </li>)}
        </ul> : <p className={styles.noChanges}>No semantic plan changes. The exported plan matches this Quarter’s current intent.</p>}
        {preview.requiredAcknowledgements.length ? <fieldset className={styles.acknowledgements}>
          <legend>Confirm these plan changes</legend>
          {preview.requiredAcknowledgements.map((item) => <label key={item.id}>
            <input type="checkbox" checked={acknowledged.includes(item.id)} onChange={(event) => setAcknowledged((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} />
            <span>{item.description}</span>
          </label>)}
        </fieldset> : <p className={styles.muted}>No additional acknowledgement is needed for this preview.</p>}
        <div className={styles.previewActions}>
          <Button onClick={() => { setPreview(null); setAcknowledged([]); setError(null); navigate(backTo); }}>Cancel</Button>
          <Button variant="secondary" disabled={busy} onClick={() => void makePreview()}>Preview again</Button>
          <Button variant="primary" disabled={busy || preview.requiredAcknowledgements.some((item) => !acknowledged.includes(item.id))} onClick={() => void apply()}>{busy ? "Applying plan…" : "Apply plan"}</Button>
        </div>
      </section> : null}
    </div>
  );
}
