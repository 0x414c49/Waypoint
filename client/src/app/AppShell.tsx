import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { QuickThoughtDialog } from "../features/journey/QuickThoughtDialog.js";
import { SearchDialog } from "../features/utilities/SearchDialog.js";
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
  const mainRef = useRef<HTMLElement>(null);
  const previousPath = useRef(location.pathname);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [thoughtOpen, setThoughtOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const refreshDashboard = useCallback(() => {
    const controller = new AbortController();
    void getDashboard(controller.signal).then(setDashboard).catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => refreshDashboard(), [location.pathname, refreshDashboard]);

  useEffect(() => {
    if (previousPath.current === location.pathname) return;
    previousPath.current = location.pathname;
    window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);

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

  useEffect(() => {
    window.addEventListener("journey:plan-applied", refreshDashboard);
    return () => window.removeEventListener("journey:plan-applied", refreshDashboard);
  }, [refreshDashboard]);

  const thoughtContext = useMemo<ThoughtContext | null>(() => {
    const task = dashboard?.activeSession?.task;
    return task ? { taskId: task.id, taskTitle: task.title } : null;
  }, [dashboard]);

  const offToday = location.pathname !== "/";
  const activeTask = dashboard?.hero.task;
  const sessionOnToday = !offToday && (activeTask?.status === "IN_PROGRESS" || activeTask?.status === "PAUSED");

  return (
    <div className={`${styles.shell} ${sessionOnToday ? styles.shellSessionOnToday : ""}`} id="app-shell">
      <a className={styles.skipLink} href="#main-content" onClick={() => mainRef.current?.focus()}>
        Skip to main content
      </a>
      <header className={styles.header} data-dialog-background>
        <div className={styles.headerInner}>
          <NavLink to="/" className={`${styles.wordmark}`}>Engineering Journey</NavLink>
          <nav className={styles.desktopNav} aria-label="Main navigation">
            <NavLink to="/" end>Today</NavLink>
            <NavLink to="/quarter">Quarter</NavLink>
            <NavLink to="/journey">Journey</NavLink>
            <NavLink to="/decisions">Decisions</NavLink>
          </nav>
          <div className={styles.utilities}>
            <Button variant="ghost" onClick={() => setThoughtOpen(true)}>+ Thought</Button>
            <Button variant="ghost" onClick={() => setSearchOpen(true)}>Search</Button>
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
      <main ref={mainRef} className={`${styles.main} ${location.pathname === "/journey" || location.pathname.startsWith("/quarter") ? styles.mainWide : ""}`} id="main-content" tabIndex={-1} data-dialog-background>
        <Outlet />
      </main>
      <nav className={`${styles.mobileNav} ${sessionOnToday ? styles.mobileNavDuringSession : ""}`} aria-label="Main navigation" data-dialog-background>
        <NavLink to="/" end>Today</NavLink>
        <NavLink to="/quarter">Quarter</NavLink>
        <NavLink to="/journey">Journey</NavLink>
        <NavLink to="/decisions">Decisions</NavLink>
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
      {searchOpen ? <SearchDialog onClose={() => setSearchOpen(false)} /> : null}
    </div>
  );
}
