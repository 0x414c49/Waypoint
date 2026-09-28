import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "../../ui/Button.js";
import { useDialogA11y } from "../today/useDialogA11y.js";
import type { ThoughtContext } from "./types.js";
import styles from "./Journey.module.css";

interface QuickThoughtDialogProps {
  inferredContext: ThoughtContext | null;
  onClose: () => void;
  onSave: (text: string, relatedTaskId: string | null) => Promise<void>;
}

export function QuickThoughtDialog({ inferredContext, onClose, onSave }: QuickThoughtDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [contextRemoved, setContextRemoved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useDialogA11y(dialogRef, onClose, "#app-shell");

  useEffect(() => inputRef.current?.focus(), []);

  const submit = async () => {
    const normalized = text.trim();
    if (!normalized) {
      setError("Write a thought before saving.");
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(
        normalized,
        inferredContext && !contextRemoved ? inferredContext.taskId : null,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The thought could not be saved.");
      setBusy(false);
    }
  };

  return createPortal(
    <div className={styles.backdrop}>
      <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="thought-title">
        <div className={styles.dialogHeading}>
          <h2 id="thought-title">Add a thought</h2>
          <Button variant="ghost" onClick={onClose} aria-label="Close thought composer">Close</Button>
        </div>
        <label className={styles.fieldLabel} htmlFor="quick-thought">What is worth keeping?</label>
        <textarea
          ref={inputRef}
          id="quick-thought"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void submit();
          }}
          aria-describedby={error ? "thought-error" : undefined}
        />
        {inferredContext && !contextRemoved ? (
          <div className={styles.inferredContext}>
            <span>Related to: <strong>{inferredContext.taskTitle}</strong></span>
            <Button variant="ghost" onClick={() => setContextRemoved(true)}>Remove</Button>
          </div>
        ) : inferredContext ? (
          <p className={styles.contextRemoved}>No task relationship. <button type="button" onClick={() => setContextRemoved(false)}>Restore</button></p>
        ) : null}
        {error ? <p id="thought-error" className={styles.error} role="alert">{error}</p> : null}
        <div className={styles.dialogActions}>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy}>{busy ? "Saving…" : "Save thought"}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
