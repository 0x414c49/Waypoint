import { feelings, type Feeling } from "./feelings.js";
import styles from "./FeelingPicker.module.css";

export function FeelingPicker({ value, onChange }: { value: Feeling | null; onChange: (value: Feeling | null) => void }) {
  return (
    <fieldset className={styles.picker}>
      <legend>How does this feel?</legend>
      <div className={styles.options}>
        {feelings.map((feeling) => <button
          key={feeling.value}
          type="button"
          className={styles.option}
          aria-pressed={value === feeling.value}
          onClick={() => onChange(value === feeling.value ? null : feeling.value)}
          title={feeling.label}
        ><span aria-hidden="true">{feeling.emoji}</span><span>{feeling.label}</span></button>)}
      </div>
    </fieldset>
  );
}

export function FeelingNote({ value }: { value: Feeling | undefined }) {
  if (!value) return null;
  const feeling = feelings.find((item) => item.value === value);
  if (!feeling) return null;
  return <span className={styles.note} aria-label={`Feeling: ${feeling.label}`} title={feeling.label}>{feeling.emoji} {feeling.label}</span>;
}
