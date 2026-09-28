import { useRef } from "react";
import { Button } from "../../ui/Button.js";
import type { ProblemDetails, TaskProjection } from "./types.js";
import { useDialogA11y } from "./useDialogA11y.js";
import styles from "./Today.module.css";

interface ActiveSessionConflictDialogProps {
  target: TaskProjection;
  activeSession: NonNullable<ProblemDetails["current"]>["activeSession"];
  busy: boolean;
  onCancel: () => void;
  onSwitch: () => void;
}

export function ActiveSessionConflictDialog({
  target,
  activeSession,
  busy,
  onCancel,
  onSwitch,
}: ActiveSessionConflictDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogA11y(dialogRef, onCancel);

  return (
    <div className={styles.backdrop}>
      <div
        className={styles.dialog}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="switch-title"
        aria-describedby="switch-description"
      >
        <p className={styles.eyebrow}>Another session is running</p>
        <h2 id="switch-title">Switch to {target.displayPlan.title}?</h2>
        <p className={styles.dialogTask} id="switch-description">
          {activeSession
            ? `Pause “${activeSession.task.title}” and save your place before switching.`
            : "Pause the current item and save your place before switching."}
        </p>
        <div className={styles.dialogActions}>
          <Button onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={onSwitch} disabled={busy}>
            {busy ? "Switching…" : "Pause current and switch"}
          </Button>
        </div>
      </div>
    </div>
  );
}
