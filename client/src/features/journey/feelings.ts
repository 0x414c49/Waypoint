import type { JourneyEntry } from "./types.js";

export type Feeling = NonNullable<JourneyEntry["feeling"]>;

export const feelings: Array<{ value: Feeling; emoji: string; label: string }> = [
  { value: "curious", emoji: "🤔", label: "Curious" },
  { value: "steady", emoji: "😌", label: "Steady" },
  { value: "stuck", emoji: "😣", label: "Stuck" },
  { value: "uncertain", emoji: "😕", label: "Unsure" },
  { value: "proud", emoji: "😊", label: "Proud" },
  { value: "tired", emoji: "😴", label: "Tired" },
];
