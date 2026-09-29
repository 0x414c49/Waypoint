import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../ui/Button.js";
import type { TaskProjection } from "../today/types.js";
import { createTaskDecision } from "./api.js";
import type { DecisionContext } from "./types.js";
import styles from "./Decisions.module.css";

function decisionContext(task: TaskProjection): DecisionContext | null {
  return task.decisionContext ?? null;
}

function ContextAction({ task, context, compact }: { task: TaskProjection; context: DecisionContext; compact: boolean }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    if (context.action === "OPEN_DECISION" && context.decision) {
      navigate(`/decisions/${encodeURIComponent(context.decision.id)}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createTaskDecision(task.id, task.etag);
      navigate(`/decisions/${encodeURIComponent(created.id)}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The Draft could not be opened.");
      setBusy(false);
    }
  };

  return (
    <div className={compact ? styles.contextActionCompact : styles.contextAction}>
      <Button type="button" variant="ghost" disabled={busy} onClick={() => void open()}>
        {context.action === "CREATE_DRAFT" ? "Start decision draft" : "Open decision"}
      </Button>
      {error ? <p role="alert" className={styles.contextError}>{error}</p> : null}
    </div>
  );
}

export function DecisionContextAction({ task, compact = false }: { task: TaskProjection; compact?: boolean }) {
  const context = decisionContext(task);
  return context ? <ContextAction task={task} context={context} compact={compact} /> : null;
}
