import { Type, type Static } from "@sinclair/typebox";

const TaskStatusSchema = Type.Union([Type.Literal("NOT_STARTED"), Type.Literal("IN_PROGRESS"), Type.Literal("PAUSED"), Type.Literal("FINISHED"), Type.Literal("SKIPPED")]);
const RecommendationModeSchema = Type.Union([Type.Literal("DEFAULT"), Type.Literal("WHEN_CLEAR"), Type.Literal("OPTIONAL")]);
const PlanProjectionSchema = Type.Object({
  focusArea: Type.Optional(Type.Object({ id: Type.String(), name: Type.String() }, { additionalProperties: false })),
  milestone: Type.Optional(Type.Object({ id: Type.String(), title: Type.String() }, { additionalProperties: false })),
  plannedDate: Type.String(), title: Type.String(), description: Type.Optional(Type.String()),
  plannedMinutes: Type.Optional(Type.Integer()), tags: Type.Array(Type.String()),
  recommendationMode: RecommendationModeSchema, removedFromPlanAt: Type.Optional(Type.String()),
}, { additionalProperties: false });
const DecisionContextSchema = Type.Object({
  decisionId: Type.String(), suggestedTitle: Type.String(),
  initialReviewDate: Type.Union([Type.String(), Type.Null()]),
  action: Type.Union([Type.Literal("CREATE_DRAFT"), Type.Literal("OPEN_DECISION")]),
  decision: Type.Union([Type.Object({
    id: Type.String(), title: Type.String(),
    status: Type.Union([Type.Literal("DRAFT"), Type.Literal("ACCEPTED"), Type.Literal("SUPERSEDED")]),
  }, { additionalProperties: false }), Type.Null()]),
}, { additionalProperties: false });
const HistoricalPlanProjectionSchema = Type.Object({
  focusArea: Type.Optional(Type.Object({ id: Type.String(), name: Type.String() }, { additionalProperties: false })),
  milestone: Type.Optional(Type.Object({ id: Type.String(), title: Type.String() }, { additionalProperties: false })),
  plannedDate: Type.String(), title: Type.String(), description: Type.Optional(Type.String()),
  plannedMinutes: Type.Optional(Type.Integer()), tags: Type.Array(Type.String()),
  recommendationMode: RecommendationModeSchema, removedFromPlanAt: Type.Optional(Type.String()),
  capturedAt: Type.String(), planRevision: Type.Integer(),
}, { additionalProperties: false });
const TimingSchema = Type.Object({
  actualSecondsAtGeneratedAt: Type.Integer({ minimum: 0 }),
  firstStartedAt: Type.Union([Type.String(), Type.Null()]),
  runningSince: Type.Union([Type.String(), Type.Null()]),
}, { additionalProperties: false });

export const TaskProjectionSchema = Type.Object({
  id: Type.String(), etag: Type.String(), status: TaskStatusSchema,
  currentPlan: PlanProjectionSchema, historicalPlan: Type.Optional(HistoricalPlanProjectionSchema),
  displayPlanSource: Type.Union([Type.Literal("CURRENT"), Type.Literal("HISTORICAL")]),
  displayPlan: PlanProjectionSchema, timing: TimingSchema, availableActions: Type.Array(Type.String()),
  decisionContext: Type.Optional(DecisionContextSchema),
}, { additionalProperties: false });
export type TaskProjectionContract = Static<typeof TaskProjectionSchema>;

const DashboardStateSchema = Type.Union([Type.Literal("ONBOARDING"), Type.Literal("READY"), Type.Literal("RUNNING"), Type.Literal("PAUSED"), Type.Literal("FINISHED"), Type.Literal("LIGHT")]);
const ActiveSessionSchema = Type.Object({
  id: Type.String(), etag: Type.String(),
  task: Type.Object({ id: Type.String(), title: Type.String(), etag: Type.String() }, { additionalProperties: false }),
  startedAt: Type.String(), timeZoneAtStart: Type.String(), intentionMinutes: Type.Optional(Type.Literal(10)),
  sessionElapsedSecondsAtGeneratedAt: Type.Integer({ minimum: 0 }),
  taskActualSecondsAtGeneratedAt: Type.Integer({ minimum: 0 }),
}, { additionalProperties: false });

export const DashboardSchema = Type.Object({
  dataRevision: Type.Integer({ minimum: 0 }), generatedAt: Type.String(), today: Type.String(), timeZone: Type.String(),
  quarter: Type.Union([Type.Object({ id: Type.String(), title: Type.String(), planRevision: Type.Integer() }, { additionalProperties: false }), Type.Null()]),
  state: DashboardStateSchema,
  hero: Type.Object({
    state: DashboardStateSchema, reason: Type.String(), task: Type.Union([TaskProjectionSchema, Type.Null()]),
    timing: Type.Union([TimingSchema, Type.Null()]),
    primaryAction: Type.Union([Type.Object({ kind: Type.String() }, { additionalProperties: false }), Type.Null()]),
    secondaryActions: Type.Array(Type.Object({ kind: Type.String() }, { additionalProperties: false })),
  }, { additionalProperties: false }),
  activeSession: Type.Union([ActiveSessionSchema, Type.Null()]),
  upNext: Type.Union([Type.Object({ reason: Type.String(), task: TaskProjectionSchema, remainingTodayCount: Type.Integer({ minimum: 0 }) }, { additionalProperties: false }), Type.Null()]),
  optionalToday: Type.Union([Type.Object({ label: Type.Literal("Only if useful"), task: TaskProjectionSchema }, { additionalProperties: false }), Type.Null()]),
  activityPreview: Type.Object({
    startDate: Type.String(), endDate: Type.String(),
    days: Type.Array(Type.Object({ date: Type.String(), sessionSeconds: Type.Integer({ minimum: 0 }), level: Type.Integer({ minimum: 0, maximum: 4 }) }, { additionalProperties: false })),
  }, { additionalProperties: false }),
  milestoneSummary: Type.Union([Type.Object({
    id: Type.String(), title: Type.String(), startDate: Type.String(), endDate: Type.String(),
    mode: Type.Union([Type.Literal("STANDARD"), Type.Literal("LIGHT"), Type.Literal("BUFFER"), Type.Literal("RETRO")]),
    sessionSeconds: Type.Integer({ minimum: 0 }), sessionCount: Type.Integer({ minimum: 0 }),
    plannedItemCount: Type.Integer({ minimum: 0 }), touchedItemCount: Type.Integer({ minimum: 0 }),
    finishedItemCount: Type.Integer({ minimum: 0 }), skippedItemCount: Type.Integer({ minimum: 0 }),
    openItemCount: Type.Integer({ minimum: 0 }), thoughtCount: Type.Integer({ minimum: 0 }),
    changedMyMindCount: Type.Integer({ minimum: 0 }), href: Type.String(),
  }, { additionalProperties: false }), Type.Null()]),
  decisionReviewsDue: Type.Object({
    count: Type.Integer({ minimum: 0 }),
    items: Type.Array(Type.Object({ decisionId: Type.String(), title: Type.String(), dueDate: Type.String() }, { additionalProperties: false })),
  }, { additionalProperties: false }),
}, { additionalProperties: false });
export type DashboardContract = Static<typeof DashboardSchema>;

export const TaskActionResponseSchema = Type.Object({
  task: TaskProjectionSchema, activeSession: Type.Union([ActiveSessionSchema, Type.Null()]),
  affectedTasks: Type.Array(TaskProjectionSchema), dashboard: DashboardSchema,
  completion: Type.Optional(Type.Object({
    taskId: Type.String(), finishEventId: Type.String(), reviewId: Type.String(),
    outcome: Type.Union([Type.Literal("ACHIEVED"), Type.Literal("PARTIAL"), Type.Literal("NOT_ACHIEVED")]),
    undoUntil: Type.String(),
  }, { additionalProperties: false })),
  reopened: Type.Optional(Type.Object({ taskId: Type.String(), reopenedEventId: Type.String(), closureEventId: Type.String() }, { additionalProperties: false })),
}, { additionalProperties: false });
export type TaskActionResponseContract = Static<typeof TaskActionResponseSchema>;
