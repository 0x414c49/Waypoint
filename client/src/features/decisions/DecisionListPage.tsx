import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../ui/Button.js";
import { Icon } from "../../ui/Icon.js";
import { getDecisions } from "./api.js";
import type { DecisionList, DecisionSummary } from "./types.js";
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
  const label = due ? "Ready to revisit" : decision.status === "DRAFT" ? "Draft" : decision.status === "SUPERSEDED" ? "Superseded" : "Accepted";
  return (
    <li className={styles.decisionRow}>
      <div>
        <div className={styles.rowMeta}><span>{label}</span>{due && dueDate(decision) ? <span>Review {dueDate(decision)}</span> : null}</div>
        <h3><Link to={`/decisions/${encodeURIComponent(decision.id)}`}>{decision.title}<Icon name="open" /></Link></h3>
        {decision.relatedTask ? <p>From {decision.relatedTask.title}</p> : null}
      </div>
    </li>
  );
}

export function DecisionListPage() {
  const [all, setAll] = useState<DecisionList>({ items: [], nextCursor: null });
  const [due, setDue] = useState<DecisionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setError(null);
    try {
      const [allPage, dueItems] = await Promise.all([
        getDecisions({ limit: 30 }, signal),
        getAllDueDecisions(signal),
      ]);
      setAll(allPage);
      setDue(dueItems);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "Technical choices could not open.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      getDecisions({ limit: 30 }, controller.signal),
      getAllDueDecisions(controller.signal),
    ]).then(([allPage, dueItems]) => {
      setAll(allPage);
      setDue(dueItems);
      setError(null);
    }).catch((caught: unknown) => {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "Technical choices could not open.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, []);

  const more = async () => {
    if (!all.nextCursor) return;
    const next = await getDecisions({ cursor: all.nextCursor, limit: 30 });
    setAll((current) => ({ items: [...current.items, ...next.items], nextCursor: next.nextCursor }));
  };

  const groups = useMemo(() => {
    const dueIds = new Set(due.map((item) => item.id));
    return {
      drafts: all.items.filter((item) => item.status === "DRAFT"),
      accepted: all.items.filter((item) => item.status === "ACCEPTED" && !dueIds.has(item.id)),
      superseded: all.items.filter((item) => item.status === "SUPERSEDED"),
    };
  }, [all.items, due]);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeading}>
        <div><h1>Technical choices</h1><p>Keep what you chose, why, and what could make you reconsider it.</p></div>
        <Link className={styles.newLink} to="/decisions/new"><Icon name="add" />Record a choice</Link>
      </header>

      {error ? <div className={styles.error} role="alert"><span>{error}</span><Button variant="ghost" onClick={() => void load()}>Try again</Button></div> : null}
      {loading ? <p role="status" className={styles.muted}>Opening decisions…</p> : null}

      {!loading && groups.drafts.length ? <section aria-labelledby="drafts-title"><SectionTitle id="drafts-title" icon="draft">Drafts to continue</SectionTitle><ul className={styles.decisionList}>{groups.drafts.map((decision) => <DecisionRow key={decision.id} decision={decision} />)}</ul></section> : null}
      {!loading && due.length ? <section aria-labelledby="ready-title"><SectionTitle id="ready-title" icon="review">Ready to revisit</SectionTitle><ul className={styles.decisionList}>{due.map((decision) => <DecisionRow key={decision.id} decision={decision} due />)}</ul></section> : null}
      {!loading && groups.accepted.length ? <section aria-labelledby="accepted-title"><SectionTitle id="accepted-title" icon="accepted">Choices in use</SectionTitle><ul className={styles.decisionList}>{groups.accepted.map((decision) => <DecisionRow key={decision.id} decision={decision} />)}</ul></section> : null}
      {!loading && groups.superseded.length ? <section aria-labelledby="superseded-title"><SectionTitle id="superseded-title" icon="history">Earlier choices</SectionTitle><ul className={styles.decisionList}>{groups.superseded.map((decision) => <DecisionRow key={decision.id} decision={decision} />)}</ul></section> : null}
      {!loading && all.items.length === 0 && due.length === 0 ? <div className={styles.empty}><h2>No technical choices yet</h2><p>Record an engineering choice when you want to remember why you made it.</p></div> : null}
      {all.nextCursor ? <div className={styles.more}><Button onClick={() => void more()}>Show more choices</Button></div> : null}
    </div>
  );
}

function SectionTitle({ id, icon, children }: { id: string; icon: "draft" | "review" | "accepted" | "history"; children: string }) {
  return <h2 className={styles.groupTitle} id={id}><Icon name={icon} />{children}</h2>;
}
