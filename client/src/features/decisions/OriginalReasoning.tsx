import type { DecisionDetail } from "./types.js";
import styles from "./Decisions.module.css";

function List({ items }: { items: string[] }) {
  return items.length ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p className={styles.muted}>Not recorded.</p>;
}

export function OriginalReasoning({ decision }: { decision: DecisionDetail }) {
  return (
    <section className={styles.original} aria-labelledby="original-reasoning-title">
      <div className={styles.sectionHeading}>
        <div><p className={styles.eyebrow}>Accepted reasoning</p><h2 id="original-reasoning-title">Original decision</h2></div>
        <span className={styles.readOnly}>Read-only history</span>
      </div>
      <div className={styles.reasoningBlock}><h3>Context</h3><p>{decision.context}</p></div>
      <div className={styles.reasoningBlock}><h3>Constraints</h3><List items={decision.constraints} /></div>
      {decision.options.length ? (
        <div className={styles.reasoningBlock}>
          <h3>Options considered</h3>
          {decision.options.map((option) => (
            <article className={styles.optionRecord} key={option.id}>
              <h4>{option.title}</h4><p>{option.description}</p>
              {option.strengths.length ? <><strong>Strengths</strong><List items={option.strengths} /></> : null}
              {option.weaknesses.length ? <><strong>Weaknesses</strong><List items={option.weaknesses} /></> : null}
            </article>
          ))}
        </div>
      ) : null}
      <div className={styles.reasoningBlock}><h3>Decision</h3><p>{decision.decision}</p></div>
      {decision.consequences ? <div className={styles.reasoningBlock}><h3>Consequences</h3><p>{decision.consequences}</p></div> : null}
      <div className={styles.reasoningBlock}><h3>Assumptions</h3><List items={decision.assumptions} /></div>
      {decision.falsifier ? <div className={styles.reasoningBlock}><h3>What would change it</h3><p>{decision.falsifier}</p></div> : null}
    </section>
  );
}
