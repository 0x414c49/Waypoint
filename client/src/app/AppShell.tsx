import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { QuickThoughtDialog } from "../features/journey/QuickThoughtDialog.js";
import { createJourneyEntry } from "../features/journey/api.js";
import type { ThoughtContext } from "../features/journey/types.js";
import { getDashboard } from "../features/today/api.js";
import type { Dashboard } from "../features/today/types.js";
import { Button } from "../ui/Button.js";
import { ThemeToggle } from "../ui/ThemeToggle.js";
import { ActiveSessionStrip } from "./ActiveSessionStrip.js";
import styles from "./AppShell.module.css";

export function AppShell() {
  const location = useLocation();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [thoughtOpen, setThoughtOpen] = useState(false);

  const refreshDashboard = useCallback(() => {
    const controller = new AbortController();
    void getDashboard(controller.signal).then(setDashboard).catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => refreshDashboard(), [location.pathname, refreshDashboard]);

  useEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent<Dashboard>).detail;
      if (detail) setDashboard(detail);
      else refreshDashboard();
    };
    window.addEventListener("journey:dashboard-changed", update);
    return () => window.removeEventListener("journey:dashboard-changed", update);
  }, [refreshDashboard]);

  useEffect(() => {
    const open = () => setThoughtOpen(true);
    window.addEventListener("journey:open-thought", open);
    return () => window.removeEventListener("journey:open-thought", open);
  }, []);

  const thoughtContext = useMemo<ThoughtContext | null>(() => {
    const task = dashboard?.activeSession?.task;
    return task ? { taskId: task.id, taskTitle: task.title } : null;
  }, [dashboard]);

  const offToday = location.pathname !== "/";
  const activeTask = dashboard?.hero.task;

  return (
    <div className={styles.shell} id="app-shell">
      <header className={styles.header} data-dialog-background>
        <div className={styles.headerInner}>
          <NavLink to="/" className={`${styles.wordmark}`}>Engineering Journey</NavLink>
          <nav className={styles.desktopNav} aria-label="Main navigation">
            <NavLink to="/" end>Today</NavLink>
            <NavLink to="/journey">Journey</NavLink>
          </nav>
          <div className={styles.utilities}>
            <Button variant="ghost" onClick={() => setThoughtOpen(true)}>+ Thought</Button>
            <ThemeToggle />
          </div>
        </div>
      </header>
      {offToday && activeTask && (activeTask.status === "IN_PROGRESS" || activeTask.status === "PAUSED") ? (
        <ActiveSessionStrip dashboard={dashboard} onUpdate={(next) => {
          setDashboard(next);
          window.dispatchEvent(new CustomEvent("journey:dashboard-changed", { detail: next }));
        }} />
      ) : null}
      <main className={styles.main} id="main-content" data-dialog-background>
        <Outlet />
      </main>
      <nav className={styles.mobileNav} aria-label="Main navigation" data-dialog-background>
        <NavLink to="/" end>Today</NavLink>
        <NavLink to="/journey">Journey</NavLink>
      </nav>
      {thoughtOpen ? (
        <QuickThoughtDialog
          inferredContext={thoughtContext}
          onClose={() => setThoughtOpen(false)}
          onSave={async (text, relatedTaskId) => {
            await createJourneyEntry({ text, relatedTaskId });
            setThoughtOpen(false);
            window.dispatchEvent(new Event("journey:entries-changed"));
          }}
        />
      ) : null}
    </div>
  );
}
