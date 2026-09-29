import { useEffect, useState } from "react";
import type { AIReviewContract, AIReviewTargetType } from "../../../../shared/contracts/index.js";
import { Button } from "../../ui/Button.js";
import { createAIReview, getAIReviews } from "./ai-reviews-api.js";
import styles from "./AIReviewPanel.module.css";

export function AIReviewPanel({ targetType, targetId, targetTitle, canGenerate = true }: {
  targetType: AIReviewTargetType;
  targetId: string;
  targetTitle: string;
  canGenerate?: boolean;
}) {
  const targetKey = `${targetType}:${targetId}`;
  const [loaded, setLoaded] = useState<{ targetKey: string; reviews: AIReviewContract[] } | null>(null);
  const [loadFailure, setLoadFailure] = useState<{ targetKey: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionFailure, setActionFailure] = useState<{ targetKey: string; message: string } | null>(null);
  const reviews = loaded?.targetKey === targetKey ? loaded.reviews : [];
  const loading = loaded?.targetKey !== targetKey && loadFailure?.targetKey !== targetKey;
  const error = (actionFailure?.targetKey === targetKey ? actionFailure.message : null) ??
    (loadFailure?.targetKey === targetKey ? loadFailure.message : null);

  useEffect(() => {
    const controller = new AbortController();
    void getAIReviews(targetType, targetId, controller.signal).then(({ items }) => {
      setLoaded({ targetKey, reviews: items });
    }).catch((caught: unknown) => {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setLoadFailure({ targetKey, message: caught instanceof Error ? caught.message : "Generated advice could not be opened." });
    });
    return () => controller.abort();
  }, [targetId, targetKey, targetType]);

  const generate = async () => {
    setBusy(true);
    setActionFailure(null);
    try {
      const review = await createAIReview(targetType, targetId);
      setLoadFailure((current) => current?.targetKey === targetKey ? null : current);
      setLoaded((current) => {
        const currentReviews = current?.targetKey === targetKey ? current.reviews : [];
        return { targetKey, reviews: currentReviews.some((item) => item.id === review.id) ? currentReviews : [...currentReviews, review] };
      });
    } catch (caught) {
      setActionFailure({ targetKey, message: caught instanceof Error ? caught.message : "Generated advice could not be created." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.panel} aria-labelledby={`ai-review-${targetType}-${targetId}`}>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Optional · generated advice</p>
          <h2 id={`ai-review-${targetType}-${targetId}`}>A reflection prompt</h2>
          <p className={styles.explanation}>A local deterministic preview for “{targetTitle}”. It cannot change this record or judge your progress.</p>
        </div>
        {canGenerate ? <Button variant="secondary" disabled={busy || loading} onClick={() => void generate()}>{busy ? "Preparing…" : reviews.length ? "Generate another" : "Generate reflection"}</Button> : null}
      </div>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      {loading ? <p className={styles.muted} role="status">Loading generated-advice history…</p> : null}
      {!loading && reviews.length ? (
        <ol className={styles.history} aria-label="Generated advice history">
          {[...reviews].reverse().map((review) => (
            <li key={review.id}>
              <div className={styles.reviewMeta}><strong>Generated advice · {review.provider}</strong><time dateTime={review.generatedAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(review.generatedAt))}</time></div>
              {review.model ? <p className={styles.muted}>Local model: {review.model}</p> : null}
              {review.summary ? <p>{review.summary}</p> : null}
              {review.strengths.length ? <div><h3>What is present</h3><ul>{review.strengths.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div> : null}
              {review.gaps.length ? <div><h3>Limits to keep in mind</h3><ul>{review.gaps.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div> : null}
              {review.suggestedFollowUp ? <p><strong>Possible next step:</strong> {review.suggestedFollowUp}</p> : null}
              {review.questions.length ? <div><h3>Questions to consider</h3><ul>{review.questions.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div> : null}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
