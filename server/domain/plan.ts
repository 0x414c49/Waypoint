import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { parseDocument } from "yaml";

const MAX_YAML_BYTES = 1024 * 1024;
const IdSchema = Type.String({ minLength: 1, maxLength: 128, pattern: "^[a-z0-9][a-z0-9._-]*$" });
const TitleSchema = Type.String({ minLength: 1, maxLength: 200 });
const LongTextSchema = Type.String({ minLength: 1, maxLength: 20_000 });
const DateSchema = Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });
const PositiveMinutesSchema = Type.Integer({ minimum: 1 });

const CriterionSchema = Type.Object({ id: IdSchema, text: LongTextSchema }, { additionalProperties: false });
const QuarterSchema = Type.Object({
  id: IdSchema,
  title: TitleSchema,
  description: Type.Optional(LongTextSchema),
  mantra: Type.Optional(LongTextSchema),
  start: DateSchema,
  end: DateSchema,
  successCriteria: Type.Optional(Type.Array(CriterionSchema, { maxItems: 100 })),
}, { additionalProperties: false });
const FocusAreaSchema = Type.Object({
  id: IdSchema,
  name: TitleSchema,
  description: Type.Optional(LongTextSchema),
  targetMinutes: Type.Optional(PositiveMinutesSchema),
}, { additionalProperties: false });
const MilestoneSchema = Type.Object({
  id: IdSchema,
  title: TitleSchema,
  description: Type.Optional(LongTextSchema),
  start: DateSchema,
  end: DateSchema,
  mode: Type.Union([
    Type.Literal("STANDARD"), Type.Literal("LIGHT"), Type.Literal("BUFFER"), Type.Literal("RETRO"),
  ]),
}, { additionalProperties: false });
const DecisionPromptSchema = Type.Object({
  decisionId: IdSchema,
  suggestedTitle: TitleSchema,
  initialReviewDate: Type.Optional(DateSchema),
}, { additionalProperties: false });
const TaskSchema = Type.Object({
  id: IdSchema,
  milestoneId: IdSchema,
  focusAreaId: Type.Optional(IdSchema),
  date: DateSchema,
  title: TitleSchema,
  description: Type.Optional(LongTextSchema),
  plannedMinutes: Type.Optional(PositiveMinutesSchema),
  tags: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 64 }), { maxItems: 20 })),
  recommendationMode: Type.Optional(Type.Union([
    Type.Literal("DEFAULT"), Type.Literal("WHEN_CLEAR"), Type.Literal("OPTIONAL"),
  ])),
  decisionPrompt: Type.Optional(DecisionPromptSchema),
}, { additionalProperties: false });

const PlanInputSchema = Type.Object({
  version: Type.Literal(1),
  quarter: QuarterSchema,
  focusAreas: Type.Array(FocusAreaSchema, { maxItems: 50 }),
  milestones: Type.Array(MilestoneSchema, { minItems: 1, maxItems: 200 }),
  tasks: Type.Array(TaskSchema, { maxItems: 5_000 }),
}, { additionalProperties: false });

export interface NormalizedPlan extends Omit<Static<typeof PlanInputSchema>, "quarter" | "tasks"> {
  quarter: Omit<Static<typeof QuarterSchema>, "successCriteria"> & {
    successCriteria: Array<Static<typeof CriterionSchema>>;
  };
  tasks: Array<Omit<Static<typeof TaskSchema>, "tags" | "recommendationMode"> & {
    tags: string[];
    recommendationMode: "DEFAULT" | "WHEN_CLEAR" | "OPTIONAL";
  }>;
}

export class PlanValidationError extends Error {
  constructor(readonly errors: readonly string[]) {
    super(`Plan validation failed: ${errors.join("; ")}`);
    this.name = "PlanValidationError";
  }
}

function normalizeStrings(value: unknown): unknown {
  if (typeof value === "string") return value.replace(/\r\n?/g, "\n").trim();
  if (Array.isArray(value)) return value.map(normalizeStrings);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, normalizeStrings(child)]));
  }
  return value;
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function validatePlan(plan: NormalizedPlan): string[] {
  const errors: string[] = [];
  const dates: Array<[string, string]> = [["/quarter/start", plan.quarter.start], ["/quarter/end", plan.quarter.end]];
  for (const [index, milestone] of plan.milestones.entries()) {
    dates.push([`/milestones/${index}/start`, milestone.start], [`/milestones/${index}/end`, milestone.end]);
  }
  for (const [index, task] of plan.tasks.entries()) {
    dates.push([`/tasks/${index}/date`, task.date]);
    if (task.decisionPrompt?.initialReviewDate) dates.push([`/tasks/${index}/decisionPrompt/initialReviewDate`, task.decisionPrompt.initialReviewDate]);
  }
  for (const [path, value] of dates) if (!isCalendarDate(value)) errors.push(`${path}: expected a valid calendar date`);
  if (plan.quarter.start > plan.quarter.end) errors.push("/quarter: start must be on or before end");

  const allIds = new Map<string, string>();
  const register = (id: string, path: string) => {
    const first = allIds.get(id);
    if (first) errors.push(`${path}: id ${id} duplicates ${first}`);
    else allIds.set(id, path);
  };
  register(plan.quarter.id, "/quarter/id");
  plan.quarter.successCriteria.forEach((item, index) => register(item.id, `/quarter/successCriteria/${index}/id`));
  plan.focusAreas.forEach((item, index) => register(item.id, `/focusAreas/${index}/id`));
  plan.milestones.forEach((item, index) => register(item.id, `/milestones/${index}/id`));
  plan.tasks.forEach((item, index) => {
    register(item.id, `/tasks/${index}/id`);
    if (item.decisionPrompt) register(item.decisionPrompt.decisionId, `/tasks/${index}/decisionPrompt/decisionId`);
  });

  const areas = new Set(plan.focusAreas.map((item) => item.id));
  const milestoneMap = new Map(plan.milestones.map((item) => [item.id, item]));
  for (const [index, milestone] of plan.milestones.entries()) {
    if (milestone.start > milestone.end) errors.push(`/milestones/${index}: start must be on or before end`);
    if (milestone.start < plan.quarter.start || milestone.end > plan.quarter.end) errors.push(`/milestones/${index}: dates must lie inside the quarter`);
    for (const [otherIndex, other] of plan.milestones.entries()) {
      if (otherIndex <= index) continue;
      if (milestone.start <= other.end && other.start <= milestone.end) errors.push(`/milestones/${otherIndex}: overlaps milestone ${milestone.id}`);
    }
  }
  for (const [index, task] of plan.tasks.entries()) {
    const milestone = milestoneMap.get(task.milestoneId);
    if (!milestone) errors.push(`/tasks/${index}/milestoneId: referenced milestone does not exist`);
    if (task.focusAreaId && !areas.has(task.focusAreaId)) errors.push(`/tasks/${index}/focusAreaId: referenced focus area does not exist`);
    if (task.date < plan.quarter.start || task.date > plan.quarter.end) errors.push(`/tasks/${index}/date: must lie inside the quarter`);
    if (milestone && (task.date < milestone.start || task.date > milestone.end)) errors.push(`/tasks/${index}/date: must lie inside the referenced milestone`);
  }
  return errors;
}

export function parseAndNormalizePlanYaml(source: string): NormalizedPlan {
  if (Buffer.byteLength(source, "utf8") > MAX_YAML_BYTES) {
    throw new PlanValidationError([`/: YAML source exceeds ${MAX_YAML_BYTES} bytes`]);
  }
  if (/\r/.test(source)) source = source.replace(/\r\n?/g, "\n");
  if (/([\uD800-\uDBFF](?![\uDC00-\uDFFF]))|((?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/.test(source)) {
    throw new PlanValidationError(["/: YAML source is not valid Unicode text"]);
  }

  const document = parseDocument(source, {
    version: "1.2",
    schema: "core",
    customTags: [],
    resolveKnownTags: false,
    merge: false,
    strict: true,
    stringKeys: true,
    uniqueKeys: true,
    logLevel: "silent",
  });
  if (document.errors.length > 0 || document.warnings.length > 0) {
    throw new PlanValidationError([...document.errors, ...document.warnings].map((error) => error.message));
  }

  let decoded: unknown;
  try {
    decoded = document.toJS({ maxAliasCount: 0 });
  } catch (error) {
    throw new PlanValidationError([error instanceof Error ? error.message : "YAML aliases are not allowed"]);
  }
  const normalized = normalizeStrings(decoded);
  const shapeErrors = [...Value.Errors(PlanInputSchema, normalized)].map((error) => `${error.path || "/"}: ${error.message}`);
  if (shapeErrors.length > 0) throw new PlanValidationError(shapeErrors);

  const input = normalized as Static<typeof PlanInputSchema>;
  const plan: NormalizedPlan = {
    ...input,
    quarter: { ...input.quarter, successCriteria: input.quarter.successCriteria ?? [] },
    tasks: input.tasks.map((task) => ({ ...task, tags: task.tags ?? [], recommendationMode: task.recommendationMode ?? "DEFAULT" })),
  };
  const semanticErrors = validatePlan(plan);
  if (semanticErrors.length > 0) throw new PlanValidationError(semanticErrors);
  return plan;
}

export const parsePlanYaml = parseAndNormalizePlanYaml;
