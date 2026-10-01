import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "../../ui/Button.js";
import { DecisionEditor } from "./DecisionEditor.js";
import { OriginalReasoning } from "./OriginalReasoning.js";
import { ReviewComposer } from "./ReviewComposer.js";
import { ReviewHistory } from "./ReviewHistory.js";
import { acceptDecision, addDecisionReview, DecisionApiError, getDecision, saveDecision } from "./api.js";
import type { DecisionDetail, DecisionDraftInput, DecisionReviewOutcome } from "./types.js";
import styles from "./Decisions.module.css";
import { Icon } from "../../ui/Icon.js";

function toDraft(decision: DecisionDetail): DecisionDraftInput {
  return {
    title: decision.title,
    constraints: decision.constraints,
    options: decision.options,
    assumptions: decision.assumptions,
    ...(decision.decisionDate ? { decisionDate: decision.decisionDate } : {}),
    ...(decision.context ? { context: decision.context } : {}),
    ...(decision.decision ? { decision: decision.decision } : {}),
    ...(decision.consequences ? { consequences: decision.consequences } : {}),
    ...(decision.falsifier ? { falsifier: decision.falsifier } : {}),
    ...(decision.initialReviewDate ? { initialReviewDate: decision.initialReviewDate } : {}),
  };
}

export function DecisionDetailPage() {
  const { decisionId = "" } = useParams();
  const [detail, setDetail] = useState<DecisionDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setDetail(await getDecision(decisionId, signal));
      setError(null);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "This decision could not open.");
    }
  }, [decisionId]);

  useEffect(() => {
    const controller = new AbortController();
    void getDecision(decisionId, controller.signal)
      .then((value) => {
        setDetail(value);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "This decision could not open.");
      });
    return () => controller.abort();
  }, [decisionId]);

  const run = async (action: () => Promise<DecisionDetail>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      setDetail(await action());
      setStale(false);
      return true;
    } catch (caught) {
      if (caught instanceof DecisionApiError && caught.status === 412) setStale(true);
      setError(caught instanceof Error ? caught.message : "The change could not be saved.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (!detail && error) return <section className={styles.empty}><h1>Decision could not open.</h1><p>{error}</p><Button onClick={() => void load()}>Try again</Button></section>;
  if (!detail) return <p role="status" className={styles.muted}>Opening decision…</p>;

  const canAccept = Boolean(detail.title.trim() && detail.context?.trim() && detail.decision?.trim() && detail.decisionDate);
  return (
    <div className={styles.page}>
      <header className={styles.detailHeading}>
        <Link className={styles.backLink} to="/decisions"><Icon name="back" width={16} height={16} />Back to choices</Link>
        <div className={styles.detailMeta}><span>{detail.status.toLowerCase()}</span>{detail.decisionDate ? <span>Decided {detail.decisionDate}</span> : null}</div>
        <h1>{detail.title || "Untitled decision"}</h1>
        {detail.relatedTask ? <p>From <Link to={`/tasks/${encodeURIComponent(detail.relatedTask.id)}`}>{detail.relatedTask.title}</Link></p> : null}
      </header>

      {error ? <div className={styles.error} role="alert"><span>{error}</span>{stale ? <Button variant="ghost" onClick={() => void load()}>Refresh version, keep my text</Button> : null}</div> : null}

      {detail.status === "DRAFT" ? (
        <DecisionEditor
          key={detail.id}
          initial={toDraft(detail)}
          busy={busy}
          canAccept={canAccept}
          onSave={async (input) => run(() => saveDecision(detail.id, detail.etag, input))}
          onAccept={async () => { await run(() => acceptDecision(detail.id, detail.etag)); }}
        />
      ) : (
        <>
          <OriginalReasoning decision={detail} />
          {detail.status === "ACCEPTED" ? (
            <ReviewComposer busy={busy} onSubmit={async (input: { outcome: DecisionReviewOutcome; notes?: string; nextReviewDate?: string }) => run(() => addDecisionReview(detail.id, detail.etag, input))} />
          ) : <p className={styles.historyNotice}>This decision was superseded. Its original reasoning and reviews remain intact.</p>}
          <ReviewHistory reviews={detail.reviews} />
        </>
      )}
    </div>
  );
}
