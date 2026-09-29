import { Button } from "../../ui/Button.js";
import type { DecisionOption } from "./types.js";
import styles from "./Decisions.module.css";

interface Props {
  option: DecisionOption;
  index: number;
  onChange: (option: DecisionOption) => void;
  onRemove: () => void;
}

function lines(value: string): string[] {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

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
        <textarea value={option.description} onChange={(event) => onChange({ ...option, description: event.target.value })} />
      </label>
      <div className={styles.fieldPair}>
        <label className={styles.field}>
          <span>Strengths <small>one per line</small></span>
          <textarea value={option.strengths.join("\n")} onChange={(event) => onChange({ ...option, strengths: lines(event.target.value) })} />
        </label>
        <label className={styles.field}>
          <span>Weaknesses <small>one per line</small></span>
          <textarea value={option.weaknesses.join("\n")} onChange={(event) => onChange({ ...option, weaknesses: lines(event.target.value) })} />
        </label>
      </div>
      <Button type="button" variant="ghost" onClick={onRemove}>Remove option</Button>
    </fieldset>
  );
}
