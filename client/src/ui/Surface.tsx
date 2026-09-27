import type { HTMLAttributes } from "react";
import styles from "./Surface.module.css";

export function Surface({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const classes = [styles.surface, className].filter(Boolean).join(" ");
  return <div className={classes} {...props} />;
}
