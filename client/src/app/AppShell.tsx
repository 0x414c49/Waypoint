import { Outlet } from "react-router-dom";
import { ThemeToggle } from "../ui/ThemeToggle.js";
import styles from "./AppShell.module.css";

export function AppShell() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <span className={styles.wordmark}>Engineering Journey</span>
          <ThemeToggle />
        </div>
      </header>
      <main className={styles.main} id="main-content">
        <Outlet />
      </main>
    </div>
  );
}
