import type { DecisionReview } from "./types.js";
import styles from "./Decisions.module.css";
import { MarkdownContent } from "../../ui/MarkdownContent.js";

const outcomeLabel = {
  HOLDS: "Still holds",
  ADJUST: "Adjusted in hindsight",
  SUPERSEDE: "Superseded",
  DEFERRED: "Review postponed",
} as const;

export function ReviewHistory({ reviews }: { reviews: DecisionReview[] }) {
  return (
    <section className={styles.documentSection} aria-labelledby="review-history-title">
      <h2 id="review-history-title">Review history</h2>
      {reviews.length === 0 ? <p className={styles.muted}>No reviews yet. Original reasoning stays here when hindsight arrives.</p> : (
        <ol className={styles.reviewHistory}>
          {[...reviews].sort((a, b) => b.sequence - a.sequence).map((review) => (
            <li key={review.id}>
              <div className={styles.reviewMeta}>
                <strong>{outcomeLabel[review.outcome]}</strong>
                <time dateTime={review.reviewedAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(review.reviewedAt))}</time>
              </div>
              {review.notes ? <MarkdownContent>{review.notes}</MarkdownContent> : null}
              {review.nextReviewDate ? <p className={styles.muted}>Next review: {review.nextReviewDate}</p> : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
