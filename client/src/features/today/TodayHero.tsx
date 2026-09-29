import { Button } from "../../ui/Button.js";
import { Surface } from "../../ui/Surface.js";
import { DecisionContextAction } from "../decisions/DecisionContextAction.js";
import { ActiveTimer } from "./ActiveTimer.js";
import type { Dashboard, TaskProjection } from "./types.js";
import styles from "./Today.module.css";

interface TodayHeroProps {
  dashboard: Dashboard;
  busy: boolean;
  onStart: (task: TaskProjection, tenMinutes?: boolean) => void;
  onPause: (task: TaskProjection) => void;
  onResume: (task: TaskProjection) => void;
  onFinish: (task: TaskProjection) => void;
  onThought: () => void;
}

const stateCopy = {
  READY: "Ready when you are",
  RUNNING: "In progress",
  PAUSED: "Your place is saved",
  FINISHED: "Finished for today",
  LIGHT: "A lighter day",
  ONBOARDING: "Ready for a plan",
} as const;

export function TodayHero({
  dashboard,
  busy,
  onStart,
  onPause,
  onResume,
  onFinish,
  onThought,
}: TodayHeroProps) {
  const task = dashboard.hero.task;
  const state = dashboard.state;

  if (!task) {
    return (
      <Surface className={styles.hero}>
        <p className={styles.eyebrow}>{stateCopy[state]}</p>
        <h2>{state === "ONBOARDING" ? "Bring in your learning plan." : "There’s nothing you need to chase today."}</h2>
        <p className={styles.heroDescription}>
          {state === "FINISHED"
            ? "Your work is recorded. You can leave the rest for another day."
            : state === "ONBOARDING"
              ? "Once a plan is loaded, Today will keep one useful next step in view."
              : "Take the space, or choose the optional item below if it would genuinely help."}
        </p>
      </Surface>
    );
  }

  const plan = task.displayPlan;
  return (
    <Surface className={styles.hero}>
      <p className={styles.eyebrow}>
        {plan.focusArea?.name ?? plan.milestone?.title ?? "Today"} · {stateCopy[state]}
      </p>
      <h2>{plan.title}</h2>
      {plan.description ? <p className={styles.heroDescription}>{plan.description}</p> : null}

      {state === "RUNNING" && dashboard.hero.timing ? (
        <ActiveTimer
          baseSeconds={dashboard.hero.timing.actualSecondsAtGeneratedAt}
          generatedAt={dashboard.generatedAt}
          {...(plan.plannedMinutes ? { plannedMinutes: plan.plannedMinutes } : {})}
        />
      ) : plan.plannedMinutes ? (
        <p className={styles.guidance}>About {plan.plannedMinutes} minutes planned</p>
      ) : null}

      <div className={styles.primaryActions}>
        {state === "READY" ? (
          <Button variant="primary" disabled={busy} onClick={() => onStart(task)}>
            Start session
          </Button>
        ) : null}
        {state === "RUNNING" ? (
          <Button variant="primary" disabled={busy} onClick={() => onPause(task)}>
            Pause
          </Button>
        ) : null}
        {state === "PAUSED" ? (
          <Button variant="primary" disabled={busy} onClick={() => onResume(task)}>
            Resume
          </Button>
        ) : null}
        {state === "READY" ? (
          <Button disabled={busy} onClick={() => onStart(task, true)}>
            Do 10 minutes
          </Button>
        ) : null}
      </div>

      {(state === "RUNNING" || state === "PAUSED" || state === "READY") ? (
        <div className={styles.secondaryActions}>
          <Button variant="ghost" onClick={onThought}>+ Thought</Button>
          <DecisionContextAction task={task} compact />
          {(state === "RUNNING" || state === "PAUSED") ? (
            <Button variant="ghost" disabled={busy} onClick={() => onFinish(task)}>
              Finish item
            </Button>
          ) : null}
        </div>
      ) : null}
    </Surface>
  );
}
