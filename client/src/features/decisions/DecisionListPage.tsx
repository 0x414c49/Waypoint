import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../ui/Button.js";
import { Surface } from "../../ui/Surface.js";
import { getDecisions } from "./api.js";
import type { DecisionList, DecisionStatus, DecisionSummary } from "./types.js";
import styles from "./Decisions.module.css";

function dueDate(item: DecisionSummary): string | null {
  return item.currentDueDate;
}

async function getAllDueDecisions(signal?: AbortSignal): Promise<DecisionSummary[]> {
  const items: DecisionSummary[] = [];
  let cursor: string | undefined;
  do {
    const page = await getDecisions({ review: "due", limit: 100, ...(cursor ? { cursor } : {}) }, signal);
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return items;
}

function DecisionRow({ decision, due = false }: { decision: DecisionSummary; due?: boolean }) {
  return (
    <li className={styles.decisionRow}>
      <div>
        <div className={styles.rowMeta}><span>{decision.status.toLowerCase()}</span>{due && dueDate(decision) ? <span>Review {dueDate(decision)}</span> : null}</div>
        <h3><Link to={`/decisions/${encodeURIComponent(decision.id)}`}>{decision.title}</Link></h3>
        {decision.relatedTask ? <p>From {decision.relatedTask.title}</p> : null}
      </div>
      <Link className={styles.openLink} to={`/decisions/${encodeURIComponent(decision.id)}`}>Open <span aria-hidden="true">→</span></Link>
    </li>
  );
}

export function DecisionListPage() {
  const [status, setStatus] = useState<DecisionStatus | "">("");
  const [all, setAll] = useState<DecisionList>({ items: [], nextCursor: null });
  const [due, setDue] = useState<DecisionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setError(null);
    try {
      const [allPage, dueItems] = await Promise.all([
        getDecisions({ ...(status ? { status } : {}), limit: 30 }, signal),
        getAllDueDecisions(signal),
      ]);
      setAll(allPage);
      setDue(dueItems);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "Decisions could not open.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      getDecisions({ ...(status ? { status } : {}), limit: 30 }, controller.signal),
      getAllDueDecisions(controller.signal),
    ]).then(([allPage, dueItems]) => {
      setAll(allPage);
      setDue(dueItems);
      setError(null);
    }).catch((caught: unknown) => {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "Decisions could not open.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [status]);

  const more = async () => {
    if (!all.nextCursor) return;
    const next = await getDecisions({ ...(status ? { status } : {}), cursor: all.nextCursor, limit: 30 });
    setAll((current) => ({ items: [...current.items, ...next.items], nextCursor: next.nextCursor }));
  };

  return (
    <div className={styles.page}>
      <header className={styles.pageHeading}>
        <div><p className={styles.eyebrow}>Reasoning worth revisiting</p><h1>Decisions</h1><p>Keep the original thinking, then add what time taught you.</p></div>
        <Link className={styles.newLink} to="/decisions/new">New decision</Link>
      </header>

      {error ? <div className={styles.error} role="alert"><span>{error}</span><Button variant="ghost" onClick={() => void load()}>Try again</Button></div> : null}
      {loading ? <p role="status" className={styles.muted}>Opening decisions…</p> : null}

      {!loading && due.length ? (
        <Surface className={styles.dueSection}>
          <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Due when you have space</p><h2>Ready to revisit</h2></div><span>{due.length}</span></div>
          <ul className={styles.decisionList}>{due.map((decision) => <DecisionRow key={decision.id} decision={decision} due />)}</ul>
        </Surface>
      ) : null}

      <section aria-labelledby="all-decisions-title">
        <div className={styles.listHeading}>
          <h2 id="all-decisions-title">All decisions</h2>
          <label><select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value as DecisionStatus | "")}><option value="">Every status</option><option value="DRAFT">Drafts</option><option value="ACCEPTED">Accepted</option><option value="SUPERSEDED">Superseded</option></select></label>
        </div>
        {!loading && all.items.length === 0 ? <div className={styles.empty}><h3>No decisions here yet.</h3><p>A Decision starts when reasoning is worth keeping—not because a form needs filling.</p></div> : null}
        <ul className={styles.decisionList}>{all.items.map((decision) => <DecisionRow key={decision.id} decision={decision} />)}</ul>
        {all.nextCursor ? <div className={styles.more}><Button onClick={() => void more()}>Show more</Button></div> : null}
      </section>
    </div>
  );
}
