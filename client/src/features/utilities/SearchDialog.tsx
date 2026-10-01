import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Button } from "../../ui/Button.js";
import { useDialogA11y } from "../today/useDialogA11y.js";
import type { SearchGroupType, SearchResponseContract, SearchResultContract } from "../../../../shared/contracts/index.js";
import { searchRecords } from "./search-api.js";
import styles from "./SearchDialog.module.css";

const groupLabels: Record<SearchGroupType, string> = { PLAN: "Quarter plan", JOURNEY: "Journey", DECISION: "Technical choices" };

function resultPath(result: SearchResultContract): string | null {
  if (result.contentType === "TASK") return `/tasks/${encodeURIComponent(result.id)}`;
  if (result.contentType === "THOUGHT") return `/journey?entryId=${encodeURIComponent(result.id)}`;
  if (result.contentType === "DECISION") return `/decisions/${encodeURIComponent(result.id)}`;
  if (!result.quarterId) return null;
  const quarterId = encodeURIComponent(result.quarterId);
  if (result.contentType === "FOCUS_AREA" && result.focusAreaId) return `/quarter/${quarterId}/focus-areas/${encodeURIComponent(result.focusAreaId)}`;
  if (result.contentType === "MILESTONE" && result.milestoneId) return `/quarter/${quarterId}/milestones/${encodeURIComponent(result.milestoneId)}`;
  return `/quarter/${quarterId}`;
}

function contentLabel(result: SearchResultContract): string {
  if (result.contentType === "THOUGHT") return "Thought";
  if (result.contentType === "DECISION") return "Technical choice";
  if (result.contentType === "TASK") return "Planned work";
  if (result.contentType === "FOCUS_AREA") return "Focus area";
  if (result.contentType === "MILESTONE") return "Milestone";
  return "Quarter";
}

function appendPage(current: SearchResponseContract | null, next: SearchResponseContract): SearchResponseContract {
  if (!current || current.query !== next.query) return next;
  const groups = new Map(current.groups.map((group) => [group.type, [...group.items]]));
  for (const group of next.groups) groups.set(group.type, [...(groups.get(group.type) ?? []), ...group.items]);
  return { query: next.query, groups: [...groups].map(([type, items]) => ({ type, items })), nextCursor: next.nextCursor };
}

export function SearchDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<SearchResponseContract | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = useCallback(() => onClose(), [onClose]);
  useDialogA11y(dialogRef, close, "#app-shell");

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    const term = query.trim();
    if (!term) return;
    const controller = new AbortController();
    void searchRecords(term, { signal: controller.signal }).then((value) => {
      setResponse(value);
      setLoading(false);
    }).catch((caught: unknown) => {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "Search could not be completed.");
      setResponse(null);
      setLoading(false);
    });
    return () => controller.abort();
  }, [query]);

  const updateQuery = (value: string) => {
    setQuery(value);
    setResponse(null);
    setError(null);
    setLoading(Boolean(value.trim()));
  };

  const showMore = async () => {
    if (!response?.nextCursor) return;
    const requestedQuery = response.query;
    setLoadingMore(true);
    setError(null);
    try {
      const next = await searchRecords(requestedQuery, { cursor: response.nextCursor });
      setResponse((current) => current?.query === requestedQuery ? appendPage(current, next) : current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "More results could not be loaded.");
    } finally {
      setLoadingMore(false);
    }
  };

  return createPortal(
    <div className={styles.backdrop}>
      <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="global-search-title">
        <header className={styles.heading}>
          <div><p className={styles.eyebrow}>Find something you planned or learned</p><h2 id="global-search-title">Search</h2></div>
          <Button variant="ghost" onClick={close}>Close</Button>
        </header>
        <label className={styles.searchField}>
          <span className={styles.visuallyHidden}>Search your plan, Journey, and technical choices</span>
          <input ref={inputRef} type="search" maxLength={200} value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="Try a task, thought, or technical choice" />
        </label>
        <div className={styles.results} aria-live="polite" aria-busy={loading || loadingMore}>
          {!query.trim() ? <p className={styles.hint}>Search the Quarter plan, Journey, and technical choices. Results open in their original context.</p> : null}
          {loading ? <p role="status" className={styles.hint}>Searching…</p> : null}
          {error ? <p role="alert" className={styles.error}>{error}</p> : null}
          {response && !loading && response.groups.length === 0 ? <p className={styles.hint}>No matches yet. Try another word.</p> : null}
          {response?.groups.map((group) => (
            <section className={styles.group} key={group.type} aria-labelledby={`search-group-${group.type}`}>
              <h3 id={`search-group-${group.type}`}>{groupLabels[group.type]}</h3>
              <ul>
                {group.items.map((result) => {
                  const path = resultPath(result);
                  return path ? <li key={`${result.contentType}-${result.id}`}>
                    <Link to={path} onClick={close}>
                      <span className={styles.resultMeta}>{contentLabel(result)}{result.occurredAt ? ` · ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(result.occurredAt))}` : ""}</span>
                      <strong>{result.title}</strong>
                      <span className={styles.excerpt}>{result.excerpt}</span>
                    </Link>
                  </li> : null;
                })}
              </ul>
            </section>
          ))}
          {response?.nextCursor ? <Button variant="secondary" disabled={loadingMore} onClick={() => void showMore()}>{loadingMore ? "Loading…" : "Show more results"}</Button> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
