import { Link } from "react-router-dom";
import type { Dashboard } from "../today/types.js";
import styles from "./Decisions.module.css";

export function DueDecisionNotice({ due }: { due: Dashboard["decisionReviewsDue"] }) {
  if (due.count === 0) return null;
  return (
    <aside className={styles.dueNotice} aria-labelledby="decisions-due-title">
      <div>
        <p className={styles.eyebrow}>When there is space</p>
        <h2 id="decisions-due-title">{due.count === 1 ? "1 technical choice is ready to revisit" : `${due.count} technical choices are ready to revisit`}</h2>
        <p>This can wait until it helps; today’s learning stays first.</p>
      </div>
      <Link to="/decisions?review=due">Review technical choices</Link>
    </aside>
  );
}
