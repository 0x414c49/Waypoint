import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../ui/Button.js";
import { carryForward } from "./api.js";
import type { TaskDetail } from "./types.js";
import styles from "./Journey.module.css";
import { MarkdownEditor } from "../../ui/MarkdownEditor.js";

export function CarryForwardForm({ detail }: { detail: TaskDetail }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [learning, setLearning] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!detail.task.availableActions.includes("CARRY_FORWARD")) return null;
  if (!open) return <Button variant="ghost" onClick={() => setOpen(true)}>Carry remaining work forward</Button>;

  const submit = async () => {
    if (!date) {
      setError("Choose when the continuation belongs.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await carryForward(detail, date, learning.trim() || undefined);
      window.dispatchEvent(new Event("journey:dashboard-changed"));
      void navigate(`/tasks/${encodeURIComponent(response.continuation.id)}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The continuation could not be created.");
      setBusy(false);
    }
  };

  return (
    <section className={styles.carryForward} aria-labelledby="carry-forward-title">
      <h2 id="carry-forward-title">Carry remaining work forward</h2>
      <p>This closes this item as made progress and creates one linked continuation. Earlier sessions stay here.</p>
      <label className={styles.fieldLabel}>Continuation date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <label className={styles.fieldLabel}>What remains? <span>Optional</span></label>
      <MarkdownEditor value={learning} onChange={setLearning} ariaLabel="What remains?" />
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <div className={styles.inlineActions}>
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
        <Button variant="primary" onClick={() => void submit()} disabled={busy}>{busy ? "Carrying forward…" : "Create continuation"}</Button>
      </div>
    </section>
  );
}
