import { useState } from "react";
import { Button } from "../../ui/Button.js";
import { DecisionOptionEditor } from "./DecisionOptionEditor.js";
import type { DecisionDraftInput, DecisionOption } from "./types.js";
import styles from "./Decisions.module.css";

interface Props {
  initial: DecisionDraftInput;
  busy: boolean;
  canAccept: boolean;
  initialSaved?: boolean;
  onSave: (input: DecisionDraftInput) => Promise<boolean>;
  onAccept?: () => Promise<void>;
}

function lines(value: string): string[] {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function DecisionEditor({ initial, busy, canAccept, initialSaved = true, onSave, onAccept }: Props) {
  const [draft, setDraft] = useState(initial);
  const [hasSaved, setHasSaved] = useState(initialSaved);
  const [savedValue, setSavedValue] = useState(() => JSON.stringify(initial));
  const dirty = JSON.stringify(draft) !== savedValue;

  const setText = (key: "title" | "decisionDate" | "context" | "decision" | "consequences" | "falsifier", value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const input: DecisionDraftInput = {
      title: draft.title.trim(),
      constraints: draft.constraints,
      options: draft.options,
      assumptions: draft.assumptions,
    };
    const decisionDate = optional(draft.decisionDate ?? "");
    const context = optional(draft.context ?? "");
    const decision = optional(draft.decision ?? "");
    const consequences = optional(draft.consequences ?? "");
    const falsifier = optional(draft.falsifier ?? "");
    const initialReviewDate = optional(draft.initialReviewDate ?? "");
    if (decisionDate) input.decisionDate = decisionDate;
    if (context) input.context = context;
    if (decision) input.decision = decision;
    if (consequences) input.consequences = consequences;
    if (falsifier) input.falsifier = falsifier;
    if (initialReviewDate) input.initialReviewDate = initialReviewDate;
    if (await onSave(input)) {
      setDraft(input);
      setSavedValue(JSON.stringify(input));
      setHasSaved(true);
    }
  };

  const addOption = () => {
    const option: DecisionOption = {
      id: `option-${crypto.randomUUID?.() ?? Date.now().toString(36)}`,
      title: "",
      description: "",
      strengths: [],
      weaknesses: [],
    };
    setDraft((current) => ({ ...current, options: [...current.options, option] }));
  };

  return (
    <form className={styles.editor} onSubmit={(event) => void submit(event)}>
      <section className={styles.documentSection} aria-labelledby="decision-basics">
        <h2 id="decision-basics">Decision</h2>
        <div className={styles.fieldPair}>
          <label className={styles.field}><span>Title</span><input required value={draft.title} onChange={(event) => setText("title", event.target.value)} /></label>
          <label className={styles.field}><span>Decision date</span><input type="date" value={draft.decisionDate ?? ""} onChange={(event) => setText("decisionDate", event.target.value)} /></label>
        </div>
        <label className={styles.field}><span>Context</span><textarea value={draft.context ?? ""} onChange={(event) => setText("context", event.target.value)} /></label>
        <label className={styles.field}><span>Constraints <small>one per line</small></span><textarea value={draft.constraints.join("\n")} onChange={(event) => setDraft((current) => ({ ...current, constraints: lines(event.target.value) }))} /></label>
      </section>

      <section className={styles.documentSection} aria-labelledby="decision-options">
        <div className={styles.sectionHeading}><h2 id="decision-options">Options considered</h2><Button type="button" variant="ghost" onClick={addOption}>Add option</Button></div>
        {draft.options.length === 0 ? <p className={styles.muted}>Options are useful context, but optional.</p> : null}
        {draft.options.map((option, index) => (
          <DecisionOptionEditor
            key={option.id}
            option={option}
            index={index}
            onChange={(next) => setDraft((current) => ({ ...current, options: current.options.map((item) => item.id === next.id ? next : item) }))}
            onRemove={() => setDraft((current) => ({ ...current, options: current.options.filter((item) => item.id !== option.id) }))}
          />
        ))}
      </section>

      <section className={styles.documentSection} aria-labelledby="decision-reasoning">
        <h2 id="decision-reasoning">Reasoning</h2>
        <label className={styles.field}><span>What we decided</span><textarea value={draft.decision ?? ""} onChange={(event) => setText("decision", event.target.value)} /></label>
        <label className={styles.field}><span>Consequences</span><textarea value={draft.consequences ?? ""} onChange={(event) => setText("consequences", event.target.value)} /></label>
        <label className={styles.field}><span>Assumptions <small>one per line</small></span><textarea value={draft.assumptions.join("\n")} onChange={(event) => setDraft((current) => ({ ...current, assumptions: lines(event.target.value) }))} /></label>
        <label className={styles.field}><span>What would change this decision?</span><textarea value={draft.falsifier ?? ""} onChange={(event) => setText("falsifier", event.target.value)} /></label>
        <label className={styles.field}><span>First review date</span><input type="date" value={draft.initialReviewDate ?? ""} onChange={(event) => setDraft((current) => ({ ...current, initialReviewDate: event.target.value }))} /></label>
      </section>

      <div className={styles.stickyActions}>
        <p role="status">{busy ? "Saving draft…" : dirty ? "Unsaved changes" : hasSaved ? "Draft saved" : "Not saved yet"}</p>
        <div>
          {onAccept ? <Button type="button" variant={!dirty && canAccept ? "primary" : "secondary"} disabled={busy || dirty || !canAccept} onClick={() => void onAccept()}>Accept decision</Button> : null}
          <Button type="submit" variant={dirty ? "primary" : "secondary"} disabled={busy || !dirty}>Save draft</Button>
        </div>
      </div>
    </form>
  );
}
