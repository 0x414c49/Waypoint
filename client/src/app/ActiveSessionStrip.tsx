import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { actOnTask, createIdempotencyKey } from "../features/today/api.js";
import type { Dashboard, TaskProjection } from "../features/today/types.js";
import { Button } from "../ui/Button.js";
import styles from "./AppShell.module.css";

function elapsed(baseSeconds: number, generatedAt: string, running: boolean, now: number): string {
  const additional = running ? Math.max(0, Math.floor((now - Date.parse(generatedAt)) / 1000)) : 0;
  const seconds = baseSeconds + additional;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${rest.toString().padStart(2, "0")}`
    : `${minutes}:${rest.toString().padStart(2, "0")}`;
}

export function ActiveSessionStrip({ dashboard, onUpdate }: { dashboard: Dashboard; onUpdate: (dashboard: Dashboard) => void }) {
  const task = dashboard.hero.task as TaskProjection;
  const running = task.status === "IN_PROGRESS";
  const [now, setNow] = useState(() => Date.parse(dashboard.generatedAt));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [running]);

  const changeState = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await actOnTask(task.id, running ? "pause" : "resume", task.etag, createIdempotencyKey());
      onUpdate(response.dashboard);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The session could not be updated.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className={styles.sessionStrip} aria-label="Current session" data-dialog-background>
      <div className={styles.sessionIdentity}>
        <strong>{task.displayPlan.title}</strong>
        <span>{running ? "Running" : "Paused"} · {elapsed(task.timing.actualSecondsAtGeneratedAt, dashboard.generatedAt, running, now)}</span>
        {error ? <span className={styles.stripError} role="alert">{error}</span> : null}
      </div>
      <div className={styles.stripActions}>
        <Button variant="primary" disabled={busy} onClick={() => void changeState()}>{running ? "Pause" : "Resume"}</Button>
        <Link to="/">Return to Today</Link>
      </div>
    </aside>
  );
}
