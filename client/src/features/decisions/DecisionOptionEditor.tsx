import { Button } from "../../ui/Button.js";
import type { DecisionOption } from "./types.js";
import styles from "./Decisions.module.css";
import { MarkdownEditor } from "../../ui/MarkdownEditor.js";

interface Props {
  option: DecisionOption;
  index: number;
  onChange: (option: DecisionOption) => void;
  onRemove: () => void;
}

function lines(value: string): string[] {
  return value.split("\n").map((item) => item.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, "").trim()).filter(Boolean);
}

function listMarkdown(items: string[]): string { return items.map((item) => `- ${item}`).join("\n"); }

export function DecisionOptionEditor({ option, index, onChange, onRemove }: Props) {
  return (
    <fieldset className={styles.optionEditor}>
      <legend>Option {index + 1}</legend>
      <label className={styles.field}>
        <span>Title</span>
        <input value={option.title} onChange={(event) => onChange({ ...option, title: event.target.value })} />
      </label>
      <label className={styles.field}>
        <span>Description</span>
        <MarkdownEditor value={option.description} onChange={(description) => onChange({ ...option, description })} ariaLabel={`Option ${index + 1} description`} minHeight={88} />
      </label>
      <div className={styles.fieldPair}>
        <label className={styles.field}>
          <span>Strengths</span>
          <MarkdownEditor value={listMarkdown(option.strengths)} onChange={(value) => onChange({ ...option, strengths: lines(value) })} ariaLabel={`Option ${index + 1} strengths`} minHeight={88} />
        </label>
        <label className={styles.field}>
          <span>Weaknesses</span>
          <MarkdownEditor value={listMarkdown(option.weaknesses)} onChange={(value) => onChange({ ...option, weaknesses: lines(value) })} ariaLabel={`Option ${index + 1} weaknesses`} minHeight={88} />
        </label>
      </div>
      <Button type="button" variant="ghost" onClick={onRemove}>Remove option</Button>
    </fieldset>
  );
}
