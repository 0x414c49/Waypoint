import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "../../ui/Button.js";
import { useDialogA11y } from "../today/useDialogA11y.js";
import { deleteJourneyEntry, updateJourneyEntry } from "./api.js";
import type { JourneyEntry } from "./types.js";
import styles from "./Journey.module.css";

export function JourneyEntryEditor({
  entry,
  onClose,
  onSaved,
  onDeleted,
  focusFallbackSelector = "#main-content",
}: {
  entry: JourneyEntry;
  onClose: () => void;
  onSaved: (entry: JourneyEntry) => void;
  onDeleted: (entryId: string) => void;
  focusFallbackSelector?: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const returnFocusToDelete = useRef(false);
  const [text, setText] = useState(entry.text);
  const [changedMyMind, setChangedMyMind] = useState(entry.changedMyMind);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  useDialogA11y(dialogRef, onClose, "#app-shell", focusFallbackSelector);
  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    if (confirmingDelete) {
      dialogRef.current?.querySelector<HTMLButtonElement>("[data-delete-cancel]")?.focus();
    } else if (returnFocusToDelete.current) {
      dialogRef.current?.querySelector<HTMLButtonElement>("[data-delete-trigger]")?.focus();
      returnFocusToDelete.current = false;
    }
  }, [confirmingDelete]);

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

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteJourneyEntry(entry);
      onDeleted(entry.id);
      window.dispatchEvent(new Event("journey:entries-changed"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The thought could not be deleted.");
      setBusy(false);
    }
  };

  return createPortal(
    <div className={styles.backdrop}>
      <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="edit-thought-title">
        <div className={styles.dialogHeading}>
          <h2 id="edit-thought-title">{confirmingDelete ? "Delete thought" : "Edit thought"}</h2>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Close</Button>
        </div>
        {confirmingDelete ? (
          <section className={styles.deleteConfirmation} aria-labelledby="confirm-delete-thought-title">
            <h3 id="confirm-delete-thought-title">Remove this thought from Journey?</h3>
            <p>This permanently removes the thought. Sessions, finished items, and decision history stay unchanged.</p>
            {text !== entry.text || changedMyMind !== entry.changedMyMind
              ? <p>Your unsaved edits in this window will also be lost.</p>
              : null}
            {error ? <p className={styles.error} role="alert">{error}</p> : null}
            <div className={styles.dialogActions}>
              <Button variant="secondary" data-delete-cancel="true" onClick={() => {
                returnFocusToDelete.current = true;
                setConfirmingDelete(false);
              }} disabled={busy}>Keep thought</Button>
              <Button variant="secondary" className={styles.deleteConfirmButton} onClick={() => void remove()} disabled={busy}>
                {busy ? "Removing…" : "Delete thought"}
              </Button>
            </div>
          </section>
        ) : (
          <>
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
              <Button variant="ghost" className={styles.deleteButton} data-delete-trigger="true" onClick={() => {
                setError(null);
                setConfirmingDelete(true);
              }} disabled={busy}>Delete thought</Button>
              <div className={styles.dialogPrimaryActions}>
                <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
                <Button variant="primary" onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
