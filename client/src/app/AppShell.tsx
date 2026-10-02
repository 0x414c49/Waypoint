import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { SearchDialog } from "../features/utilities/SearchDialog.js";
import { createJourneyEntry } from "../features/journey/api.js";
import type { ThoughtContext } from "../features/journey/types.js";
import { getDashboard } from "../features/today/api.js";
import type { Dashboard } from "../features/today/types.js";
import { Button } from "../ui/Button.js";
import { ThemeToggle } from "../ui/ThemeToggle.js";
import { ActiveSessionStrip } from "./ActiveSessionStrip.js";
import { Icon, WaypointMark } from "../ui/Icon.js";
import styles from "./AppShell.module.css";
import { useAuth } from "../features/auth/AuthContext.js";

const QuickThoughtDialog = lazy(() => import("../features/journey/QuickThoughtDialog.js").then((module) => ({ default: module.QuickThoughtDialog })));

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const mainRef = useRef<HTMLElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const previousPath = useRef(location.pathname);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [thoughtOpen, setThoughtOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

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
    if (!accountOpen) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) return;
      const menu = document.getElementById("account-menu");
      const button = document.getElementById("account-menu-button");
      if (menu?.contains(event.target) || button?.contains(event.target)) return;
      setAccountOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setAccountOpen(false); accountButtonRef.current?.focus(); }
    };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("mousedown", closeOnOutside); document.removeEventListener("keydown", closeOnEscape); };
  }, [accountOpen]);

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
          <NavLink to="/" className={styles.brand ?? ""} aria-label="Waypoint · Today">
            <WaypointMark className={styles.brandMark ?? ""} />
            <span>Waypoint</span>
          </NavLink>
          <nav className={styles.desktopNav} aria-label="Main navigation">
            <NavLink to="/" end><Icon name="today" />Today</NavLink>
            <NavLink to="/quarter"><Icon name="quarter" />Quarter</NavLink>
            <NavLink to="/journey"><Icon name="journey" />Journey</NavLink>
            <NavLink to="/decisions"><Icon name="decisions" />Tech choices</NavLink>
            <NavLink to="/profile"><Icon name="user" />Profile</NavLink>
          </nav>
          <div className={styles.utilities}>
            <Button variant="ghost" className={styles.utilityButton} onClick={() => setThoughtOpen(true)}><Icon name="thought" /><span>Thought</span></Button>
            <Button variant="ghost" className={styles.utilityButton} onClick={() => setSearchOpen(true)}><Icon name="search" /><span>Search</span></Button>
            <ThemeToggle />
            <div className={styles.account}>
              <button
                id="account-menu-button"
                ref={accountButtonRef}
                className={styles.accountButton}
                type="button"
                aria-expanded={accountOpen}
                aria-controls="account-menu"
                onClick={() => setAccountOpen((open) => !open)}
              >
                <span className={styles.accountInitial} aria-hidden="true">{user?.name.charAt(0).toUpperCase() ?? "?"}</span>
                <span className={styles.accountName}>{user?.name ?? "Account"}</span>
              </button>
              {accountOpen ? (
                <div id="account-menu" className={styles.accountMenu} role="menu" aria-label="Account menu">
                  <div className={styles.accountIdentity}>
                    <strong>{user?.name}</strong>
                    <span>{user?.email}</span>
                    <span>{user?.role === "OWNER" ? "Owner" : "Member"}</span>
                  </div>
                  <NavLink role="menuitem" to="/profile" onClick={() => setAccountOpen(false)}>Profile & settings</NavLink>
                  <button role="menuitem" type="button" onClick={() => { void (async () => { try { await signOut(); } finally { setAccountOpen(false); navigate("/sign-in", { replace: true }); } })(); }}>Sign out</button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>
      {offToday && activeTask && (activeTask.status === "IN_PROGRESS" || activeTask.status === "PAUSED") ? (
        <ActiveSessionStrip dashboard={dashboard} onUpdate={(next) => {
          setDashboard(next);
          window.dispatchEvent(new CustomEvent("journey:dashboard-changed", { detail: next }));
        }} />
      ) : null}
      <main ref={mainRef} className={styles.main} id="main-content" tabIndex={-1} data-dialog-background>
        <Outlet />
      </main>
      <nav className={`${styles.mobileNav} ${sessionOnToday ? styles.mobileNavDuringSession : ""}`} aria-label="Main navigation" data-dialog-background>
        <NavLink to="/" end><Icon name="today" /><span>Today</span></NavLink>
        <NavLink to="/quarter"><Icon name="quarter" /><span>Quarter</span></NavLink>
        <NavLink to="/journey"><Icon name="journey" /><span>Journey</span></NavLink>
        <NavLink to="/decisions"><Icon name="decisions" /><span>Tech choices</span></NavLink>
      </nav>
      {thoughtOpen ? (
        <Suspense fallback={<p role="status">Opening the thought editor…</p>}>
          <QuickThoughtDialog
            inferredContext={thoughtContext}
            onClose={() => setThoughtOpen(false)}
            onSave={async (text, relatedTaskId, feeling) => {
              await createJourneyEntry({ text, relatedTaskId, feeling });
              setThoughtOpen(false);
              window.dispatchEvent(new Event("journey:entries-changed"));
            }}
          />
        </Suspense>
      ) : null}
      {searchOpen ? <SearchDialog onClose={() => setSearchOpen(false)} /> : null}
    </div>
  );
}
