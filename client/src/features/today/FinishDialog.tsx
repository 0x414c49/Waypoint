import { useRef, useState, type FormEvent } from "react";
import { Button } from "../../ui/Button.js";
import type { FinishOutcome, TaskProjection } from "./types.js";
import { useDialogA11y } from "./useDialogA11y.js";
import styles from "./Today.module.css";

interface FinishDialogProps {
  task: TaskProjection;
  busy: boolean;
  onClose: () => void;
  onFinish: (outcome: FinishOutcome, keyLearning?: string) => void;
}

const outcomes: Array<{ value: FinishOutcome; label: string }> = [
  { value: "ACHIEVED", label: "Achieved" },
  { value: "PARTIAL", label: "Made progress" },
  { value: "NOT_ACHIEVED", label: "Not achieved" },
];

export function FinishDialog({ task, busy, onClose, onFinish }: FinishDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [outcome, setOutcome] = useState<FinishOutcome | null>(null);
  const [keyLearning, setKeyLearning] = useState("");
  const [showError, setShowError] = useState(false);
  useDialogA11y(dialogRef, onClose);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!outcome) {
      setShowError(true);
      return;
    }
    const takeaway = keyLearning.trim();
    onFinish(outcome, takeaway.length > 0 ? takeaway : undefined);
  };

  return (
    <div className={styles.backdrop}>
      <div
        className={styles.dialog}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="finish-title"
        aria-describedby="finish-task"
      >
        <form onSubmit={submit} aria-busy={busy}>
          <div className={styles.dialogHeader}>
            <div>
              <p className={styles.eyebrow}>Finish item</p>
              <h2 id="finish-title">How did it land?</h2>
            </div>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy} aria-label="Close finish dialog">
              Close
            </Button>
          </div>
          <p className={styles.dialogTask} id="finish-task">{task.displayPlan.title}</p>
          <fieldset className={styles.outcomes} aria-describedby={showError ? "outcome-error" : undefined}>
            <legend>Outcome</legend>
            {outcomes.map((choice) => (
              <label className={styles.outcome} data-selected={outcome === choice.value} key={choice.value}>
                <input
                  type="radio"
                  name="outcome"
                  value={choice.value}
                  checked={outcome === choice.value}
                  onChange={() => {
                    setOutcome(choice.value);
                    setShowError(false);
                  }}
                />
                {choice.label}
              </label>
            ))}
          </fieldset>
          {showError ? <p className={styles.fieldError} id="outcome-error">Choose an outcome to finish this item.</p> : null}
          <label className={styles.textareaLabel} htmlFor="key-learning">
            One thing worth remembering? <span>Optional</span>
          </label>
          <textarea
            id="key-learning"
            maxLength={2_000}
            rows={3}
            value={keyLearning}
            onChange={(event) => setKeyLearning(event.currentTarget.value)}
          />
          <div className={styles.dialogActions}>
            <Button type="button" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={busy}>
              {busy ? "Finishing…" : "Finish item"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
