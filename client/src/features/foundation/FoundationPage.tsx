import { Surface } from "../../ui/Surface.js";
import styles from "./FoundationPage.module.css";

export function FoundationPage() {
  return (
    <section aria-labelledby="foundation-title">
      <p className={styles.eyebrow}>Ready on this device</p>
      <Surface>
        <h1 className={styles.title} id="foundation-title">
          Your learning space is ready.
        </h1>
        <p className={styles.copy}>
          Your private workspace is running. No learning plan is loaded yet.
        </p>
        <p className={styles.status} role="status">
          <span className={styles.statusMark} aria-hidden="true" />
          Stored locally on this device
        </p>
      </Surface>
    </section>
  );
}
