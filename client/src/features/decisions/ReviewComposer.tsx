import { useState } from "react";
import { Button } from "../../ui/Button.js";
import type { DecisionReviewOutcome } from "./types.js";
import styles from "./Decisions.module.css";

interface Props {
  busy: boolean;
  onSubmit: (input: { outcome: DecisionReviewOutcome; notes?: string; nextReviewDate?: string }) => Promise<boolean>;
}

export function ReviewComposer({ busy, onSubmit }: Props) {
  const [outcome, setOutcome] = useState<DecisionReviewOutcome>("HOLDS");
  const [notes, setNotes] = useState("");
  const [nextReviewDate, setNextReviewDate] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const saved = await onSubmit({
      outcome,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(nextReviewDate ? { nextReviewDate } : {}),
    });
    if (!saved) return;
    setNotes("");
    setNextReviewDate("");
  };

  return (
    <section className={styles.reviewComposer} aria-labelledby="review-title">
      <p className={styles.eyebrow}>Hindsight, not rewriting</p>
      <h2 id="review-title">Review this decision</h2>
      <form onSubmit={(event) => void submit(event)}>
        <fieldset className={styles.reviewOutcomes}>
          <legend>What is true now?</legend>
          {(["HOLDS", "ADJUST", "SUPERSEDE", "DEFERRED"] as const).map((value) => (
            <label key={value} data-selected={outcome === value}>
              <input type="radio" name="outcome" value={value} checked={outcome === value} onChange={() => setOutcome(value)} />
              {{ HOLDS: "It still holds", ADJUST: "I would adjust it", SUPERSEDE: "Replace it", DEFERRED: "Postpone review" }[value]}
            </label>
          ))}
        </fieldset>
        {outcome !== "DEFERRED" ? (
          <label className={styles.field}><span>What changed or still holds?</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        ) : null}
        <label className={styles.field}>
          <span>{outcome === "DEFERRED" ? "Review later" : "Next review date (optional)"}</span>
          <input type="date" required={outcome === "DEFERRED"} value={nextReviewDate} onChange={(event) => setNextReviewDate(event.target.value)} />
        </label>
        <div className={styles.formActions}>
          <Button type="submit" variant="primary" disabled={busy}>{outcome === "DEFERRED" ? "Postpone review" : "Add review"}</Button>
        </div>
      </form>
    </section>
  );
}
