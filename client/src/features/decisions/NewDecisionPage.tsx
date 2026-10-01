import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DecisionEditor } from "./DecisionEditor.js";
import { createDecision, saveDecision } from "./api.js";
import type { DecisionDetail, DecisionDraftInput } from "./types.js";
import styles from "./Decisions.module.css";
import { Icon } from "../../ui/Icon.js";

const emptyDraft: DecisionDraftInput = { title: "", constraints: [], options: [], assumptions: [] };

export function NewDecisionPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdDraft, setCreatedDraft] = useState<DecisionDetail | null>(null);

  const save = async (input: DecisionDraftInput): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const created = createdDraft ?? await createDecision({
          title: input.title,
          ...(input.initialReviewDate ? { initialReviewDate: input.initialReviewDate } : {}),
        });
      if (!createdDraft) setCreatedDraft(created);
      const saved = await saveDecision(created.id, created.etag, input);
      navigate(`/decisions/${encodeURIComponent(saved.id)}`, { replace: true });
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The Draft could not be saved.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.detailHeading}><Link className={styles.backLink} to="/decisions"><Icon name="back" width={16} height={16} />Back to choices</Link><p className={styles.eyebrow}>New draft</p><h1>Record a technical choice</h1><p>Write down the engineering choice, why you made it, and what could make you reconsider it.</p></header>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <DecisionEditor initial={emptyDraft} busy={busy} canAccept={false} initialSaved={false} onSave={save} />
    </div>
  );
}
