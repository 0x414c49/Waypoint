import { useState } from "react";
import { Button } from "../../ui/Button.js";
import { DecisionOptionEditor } from "./DecisionOptionEditor.js";
import type { DecisionDraftInput, DecisionOption } from "./types.js";
import styles from "./Decisions.module.css";
import { MarkdownEditor } from "../../ui/MarkdownEditor.js";

interface Props {
  initial: DecisionDraftInput;
  busy: boolean;
  canAccept: boolean;
  initialSaved?: boolean;
  onSave: (input: DecisionDraftInput) => Promise<boolean>;
  onAccept?: () => Promise<void>;
}

function lines(value: string): string[] {
  return value.split("\n").map((item) => item.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, "").trim()).filter(Boolean);
}

function listMarkdown(items: string[]): string { return items.map((item) => `- ${item}`).join("\n"); }

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function DecisionEditor({ initial, busy, canAccept, initialSaved = true, onSave, onAccept }: Props) {
  const [draft, setDraft] = useState(initial);
  const [hasSaved, setHasSaved] = useState(initialSaved);
  const [savedValue, setSavedValue] = useState(() => JSON.stringify(initial));
  const [moreDetailOpen, setMoreDetailOpen] = useState(() => Boolean(
    initial.consequences || initial.falsifier || initial.initialReviewDate ||
    initial.constraints.length || initial.options.length || initial.assumptions.length,
  ));
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
        <h2 id="decision-basics">The gist</h2>
        <label className={styles.field}><span>Title</span><input required value={draft.title} onChange={(event) => setText("title", event.target.value)} /></label>
        <label className={styles.field}><span>What is going on?</span></label>
        <MarkdownEditor value={draft.context ?? ""} onChange={(value) => setText("context", value)} ariaLabel="What is going on?" />
        <label className={styles.field}><span>What did you decide?</span></label>
        <MarkdownEditor value={draft.decision ?? ""} onChange={(value) => setText("decision", value)} ariaLabel="What did you decide?" />
        <label className={styles.field}><span>Decision date <small>Needed to accept</small></span><input type="date" value={draft.decisionDate ?? ""} onChange={(event) => setText("decisionDate", event.target.value)} /></label>
      </section>

      <details className={styles.moreDetail} open={moreDetailOpen} onToggle={(event) => setMoreDetailOpen(event.currentTarget.open)}>
        <summary>Add more detail <span>Optional: alternatives, constraints, consequences, and what might change your mind</span></summary>
        <div className={styles.moreDetailContent}>
          <label className={styles.field}><span>Constraints</span></label>
          <MarkdownEditor value={listMarkdown(draft.constraints)} onChange={(value) => setDraft((current) => ({ ...current, constraints: lines(value) }))} ariaLabel="Constraints" />
          <section className={styles.optionalGroup} aria-labelledby="decision-options">
            <div className={styles.sectionHeading}><h3 id="decision-options">Options considered</h3><Button type="button" variant="ghost" onClick={addOption}>Add option</Button></div>
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
          <label className={styles.field}><span>Consequences</span></label>
          <MarkdownEditor value={draft.consequences ?? ""} onChange={(value) => setText("consequences", value)} ariaLabel="Consequences" />
          <label className={styles.field}><span>Assumptions</span></label>
          <MarkdownEditor value={listMarkdown(draft.assumptions)} onChange={(value) => setDraft((current) => ({ ...current, assumptions: lines(value) }))} ariaLabel="Assumptions" />
          <label className={styles.field}><span>What might change your mind?</span></label>
          <MarkdownEditor value={draft.falsifier ?? ""} onChange={(value) => setText("falsifier", value)} ariaLabel="What might change your mind?" />
          <label className={styles.field}><span>First review date <small>Optional reminder</small></span><input type="date" value={draft.initialReviewDate ?? ""} onChange={(event) => setDraft((current) => ({ ...current, initialReviewDate: event.target.value }))} /></label>
        </div>
      </details>

      <div className={styles.stickyActions}>
        <p role="status">{busy ? "Saving draft…" : dirty ? "Unsaved changes" : hasSaved ? "Draft saved" : "Not saved yet"}</p>
        <div>
          {onAccept ? <div className={styles.acceptAction}><Button type="button" variant={!dirty && canAccept ? "primary" : "secondary"} disabled={busy || dirty || !canAccept} onClick={() => void onAccept()}>Accept decision</Button>{!canAccept ? <span>To accept, add a title, context, decision, and date.</span> : dirty ? <span>Save your changes before accepting.</span> : null}</div> : null}
          <Button type="submit" variant={dirty ? "primary" : "secondary"} disabled={busy || !dirty}>Save draft</Button>
        </div>
      </div>
    </form>
  );
}
