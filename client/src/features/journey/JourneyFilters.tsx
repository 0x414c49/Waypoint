import type { JourneyFilters as FilterValues, JourneyItemType } from "./types.js";
import styles from "./Journey.module.css";

interface JourneyFiltersProps {
  filters: FilterValues;
  tasks: Array<{ id: string; title: string }>;
  milestones: Array<{ id: string; title: string }>;
  onChange: (filters: FilterValues) => void;
}

const types: Array<{ value: JourneyItemType | ""; label: string }> = [
  { value: "", label: "Everything" },
  { value: "THOUGHT", label: "Thoughts" },
  { value: "WEEKLY_REFLECTION", label: "Weekly thoughts" },
  { value: "SESSION", label: "Sessions" },
  { value: "TASK_FINISHED", label: "Finished items" },
];

export function JourneyFilters({ filters, tasks, milestones, onChange }: JourneyFiltersProps) {
  const withValue = <K extends keyof FilterValues>(key: K, value: FilterValues[K] | undefined): FilterValues => {
    const next = { ...filters };
    if (value === undefined || value === "") delete next[key];
    else next[key] = value;
    return next;
  };
  return (
    <section className={styles.filters} aria-label="Filter Journey">
      <label>
        <span>From</span>
        <input type="date" value={filters.from ?? ""} onChange={(event) => onChange(withValue("from", event.target.value || undefined))} />
      </label>
      <label>
        <span>To</span>
        <input type="date" value={filters.to ?? ""} onChange={(event) => onChange(withValue("to", event.target.value || undefined))} />
      </label>
      <label>
        <span>Task</span>
        <select value={filters.taskId ?? ""} onChange={(event) => onChange(withValue("taskId", event.target.value || undefined))}>
          <option value="">All tasks</option>
          {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
        </select>
      </label>
      <label>
        <span>Type</span>
        <select value={filters.type ?? ""} onChange={(event) => onChange(withValue("type", event.target.value as JourneyItemType | ""))}>
          {types.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
        </select>
      </label>
      <label>
        <span>Milestone</span>
        <select value={filters.milestoneId ?? ""} onChange={(event) => onChange(withValue("milestoneId", event.target.value || undefined))}>
          <option value="">All milestones</option>
          {milestones.map((milestone) => <option key={milestone.id} value={milestone.id}>{milestone.title}</option>)}
        </select>
      </label>
      <label className={styles.checkboxLabel}>
        <input
          type="checkbox"
          checked={filters.changedMyMind ?? false}
          onChange={(event) => onChange(withValue("changedMyMind", event.target.checked || undefined))}
        />
        <span>Changed my mind</span>
      </label>
    </section>
  );
}
