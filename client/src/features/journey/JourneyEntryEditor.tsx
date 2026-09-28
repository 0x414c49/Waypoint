import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "../../ui/Button.js";
import { useDialogA11y } from "../today/useDialogA11y.js";
import { updateJourneyEntry } from "./api.js";
import type { JourneyEntry } from "./types.js";
import styles from "./Journey.module.css";

export function JourneyEntryEditor({
  entry,
  onClose,
  onSaved,
}: {
  entry: JourneyEntry;
  onClose: () => void;
  onSaved: (entry: JourneyEntry) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(entry.text);
  const [changedMyMind, setChangedMyMind] = useState(entry.changedMyMind);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useDialogA11y(dialogRef, onClose, "#app-shell");
  useEffect(() => inputRef.current?.focus(), []);

  const save = async () => {
    if (!text.trim()) {
      setError("Write a thought before saving.");
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await updateJourneyEntry(entry, { text: text.trim(), changedMyMind });
      onSaved(updated);
      window.dispatchEvent(new Event("journey:entries-changed"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The thought could not be updated.");
      setBusy(false);
    }
  };

  return createPortal(
    <div className={styles.backdrop}>
      <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="edit-thought-title">
        <div className={styles.dialogHeading}>
          <h2 id="edit-thought-title">Edit thought</h2>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
        <label className={styles.fieldLabel}>
          What is worth keeping?
          <textarea ref={inputRef} value={text} onChange={(event) => setText(event.target.value)} />
        </label>
        <label className={styles.checkboxLabel}>
          <input type="checkbox" checked={changedMyMind} onChange={(event) => setChangedMyMind(event.target.checked)} />
          This changed how I think
        </label>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <div className={styles.dialogActions}>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
