import { useEffect, useState } from "react";
import styles from "./Today.module.css";

interface ActiveTimerProps {
  baseSeconds: number;
  generatedAt: string;
  plannedMinutes?: number;
}

function elapsedSeconds(baseSeconds: number, generatedAt: string): number {
  const sinceSnapshot = Math.max(0, Math.floor((Date.now() - Date.parse(generatedAt)) / 1_000));
  return baseSeconds + sinceSnapshot;
}

function clock(seconds: number): string {
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? [hours, minutes, remainder].map((value) => String(value).padStart(2, "0")).join(":")
    : [minutes, remainder].map((value) => String(value).padStart(2, "0")).join(":");
}

export function ActiveTimer({ baseSeconds, generatedAt, plannedMinutes }: ActiveTimerProps) {
  const [, setTick] = useState(() => Date.now());
  const seconds = elapsedSeconds(baseSeconds, generatedAt);

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className={styles.timer} aria-label={`Elapsed time ${clock(seconds)}`}>
      <span aria-hidden="true">{clock(seconds)}</span>
      <span className={styles.timerGuidance}>
        {plannedMinutes ? `About ${plannedMinutes} minutes planned` : "Time spent on this item"}
      </span>
    </div>
  );
}
