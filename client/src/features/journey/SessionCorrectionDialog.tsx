import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "../../ui/Button.js";
import { useDialogA11y } from "../today/useDialogA11y.js";
import { correctSession } from "./api.js";
import type { SessionDetail } from "./types.js";
import styles from "./Journey.module.css";

function localInput(instant: string): string {
  return new Date(instant).toISOString().slice(0, 16);
}

function instant(local: string): string {
  return new Date(`${local}:00.000Z`).toISOString();
}

interface SessionCorrectionDialogProps {
  session: SessionDetail;
  onClose: () => void;
  onCorrected: (session: SessionDetail) => void;
}

export function SessionCorrectionDialog({ session, onClose, onCorrected }: SessionCorrectionDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstField = useRef<HTMLInputElement>(null);
  const [startedAt, setStartedAt] = useState(localInput(session.startedAt));
  const [endedAt, setEndedAt] = useState(session.endedAt ? localInput(session.endedAt) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useDialogA11y(dialogRef, onClose, "#app-shell");
  useEffect(() => firstField.current?.focus(), []);

  const save = async () => {
    if (!startedAt || (session.endedAt && !endedAt)) {
      setError("Enter the complete session interval.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const corrected = await correctSession(session, instant(startedAt), session.endedAt ? instant(endedAt) : null);
      onCorrected(corrected);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The session could not be corrected.");
      setBusy(false);
    }
  };

  return createPortal(
    <div className={styles.backdrop}>
      <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="correction-title">
        <div className={styles.dialogHeading}>
          <h2 id="correction-title">Correct session time</h2>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
        <p className={styles.muted}>Use this only when the recorded timer was wrong. Times are entered in UTC; this session was captured in {session.timeZoneAtStart}.</p>
        <label className={styles.fieldLabel}>
          Started (UTC)
          <input ref={firstField} type="datetime-local" value={startedAt} onChange={(event) => setStartedAt(event.target.value)} />
        </label>
        <label className={styles.fieldLabel}>
          Ended (UTC)
          <input
            type="datetime-local"
            value={endedAt}
            disabled={!session.endedAt}
            onChange={(event) => setEndedAt(event.target.value)}
          />
        </label>
        {!session.endedAt ? <p className={styles.muted}>Pause from Today to end a running session.</p> : null}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <div className={styles.dialogActions}>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : "Save correction"}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
