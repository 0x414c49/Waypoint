import { Type, type Static } from "@sinclair/typebox";
import { DashboardSchema, TaskProjectionSchema } from "./today.js";

const RelationSchema = Type.Object({ id: Type.String(), title: Type.String() }, { additionalProperties: false });
const MilestoneRelationSchema = Type.Object({ id: Type.String(), quarterId: Type.String(), title: Type.String() }, { additionalProperties: false });
const TaskStatusSchema = Type.Union([
  Type.Literal("NOT_STARTED"), Type.Literal("IN_PROGRESS"), Type.Literal("PAUSED"),
  Type.Literal("FINISHED"), Type.Literal("SKIPPED"),
]);
const OutcomeSchema = Type.Union([
  Type.Literal("ACHIEVED"), Type.Literal("PARTIAL"), Type.Literal("NOT_ACHIEVED"),
]);
export const JourneyEntrySchema = Type.Object({
  id: Type.String(), etag: Type.String(),
  type: Type.Union([Type.Literal("THOUGHT"), Type.Literal("WEEKLY_REFLECTION")]),
  occurredAt: Type.String(), localDate: Type.String(), text: Type.String(), tags: Type.Array(Type.String()),
  changedMyMind: Type.Boolean(),
  relatedTask: Type.Union([RelationSchema, Type.Null()]),
  relatedMilestone: Type.Union([MilestoneRelationSchema, Type.Null()]),
  relatedDecision: Type.Union([RelationSchema, Type.Null()]),
  createdAt: Type.String(), updatedAt: Type.Union([Type.String(), Type.Null()]),
}, { additionalProperties: false });

const SessionTimelineItemSchema = Type.Object({
  id: Type.String(), type: Type.Literal("SESSION"), occurredAt: Type.String(), endedAt: Type.String(),
  seconds: Type.Integer({ minimum: 0 }), task: RelationSchema,
}, { additionalProperties: false });
const FinishedTimelineItemSchema = Type.Object({
  id: Type.String(), type: Type.Literal("TASK_FINISHED"), occurredAt: Type.String(),
  task: RelationSchema,
  outcome: Type.Union([Type.Literal("ACHIEVED"), Type.Literal("PARTIAL"), Type.Literal("NOT_ACHIEVED")]),
  keyLearning: Type.Union([Type.String(), Type.Null()]),
}, { additionalProperties: false });
export const JourneyTimelineItemSchema = Type.Union([
  JourneyEntrySchema, SessionTimelineItemSchema, FinishedTimelineItemSchema,
]);
export const JourneyTimelineSchema = Type.Object({
  items: Type.Array(JourneyTimelineItemSchema),
  nextCursor: Type.Union([Type.String(), Type.Null()]),
}, { additionalProperties: false });

export const ActivitySchema = Type.Object({
  from: Type.String(), to: Type.String(),
  days: Type.Array(Type.Object({
    date: Type.String(), sessionSeconds: Type.Integer({ minimum: 0 }),
    level: Type.Integer({ minimum: 0, maximum: 4 }),
  }, { additionalProperties: false })),
}, { additionalProperties: false });

export const SessionProjectionSchema = Type.Object({
  id: Type.String(), etag: Type.String(), taskId: Type.String(), startedAt: Type.String(),
  endedAt: Type.Union([Type.String(), Type.Null()]), timeZoneAtStart: Type.String(),
  intentionMinutes: Type.Optional(Type.Literal(10)), actualSecondsAtGeneratedAt: Type.Integer({ minimum: 0 }),
  createdAt: Type.String(), updatedAt: Type.String(), correctedAt: Type.Union([Type.String(), Type.Null()]),
}, { additionalProperties: false });
export const SessionListSchema = Type.Object({ items: Type.Array(SessionProjectionSchema) }, { additionalProperties: false });

export const TaskDetailSchema = Type.Object({
  task: TaskProjectionSchema,
  quarterId: Type.String(),
  sessionsHref: Type.String(),
  sessions: Type.Array(SessionProjectionSchema),
  reviews: Type.Array(Type.Object({
    id: Type.String(), finishEventId: Type.String(), outcome: OutcomeSchema,
    keyLearning: Type.Union([Type.String(), Type.Null()]), reflection: Type.Union([Type.String(), Type.Null()]),
    createdAt: Type.String(),
  }, { additionalProperties: false })),
  thoughts: Type.Array(JourneyEntrySchema),
  lifecycle: Type.Array(Type.Object({
    id: Type.String(), sequence: Type.Integer(),
    type: Type.Union([Type.Literal("FINISHED"), Type.Literal("SKIPPED"), Type.Literal("REOPENED"), Type.Literal("CARRIED_FORWARD")]),
    occurredAt: Type.String(),
    relatedTaskId: Type.Union([Type.String(), Type.Null()]), undoesEventId: Type.Union([Type.String(), Type.Null()]),
  }, { additionalProperties: false })),
}, { additionalProperties: false });
export const TaskListSchema = Type.Object({
  items: Type.Array(TaskProjectionSchema),
  nextCursor: Type.Union([Type.String(), Type.Null()]),
}, { additionalProperties: false });

const CountSchema = Type.Integer({ minimum: 0 });
export const MilestoneSummarySchema = Type.Object({
  dataRevision: CountSchema,
  milestone: Type.Object({
    id: Type.String(), quarterId: Type.String(), title: Type.String(), startDate: Type.String(), endDate: Type.String(),
    mode: Type.Union([Type.Literal("STANDARD"), Type.Literal("LIGHT"), Type.Literal("BUFFER"), Type.Literal("RETRO")]),
    displaySource: Type.Union([Type.Literal("CURRENT"), Type.Literal("HISTORICAL")]),
  }, { additionalProperties: false }),
  counts: Type.Object({ planned: CountSchema, touched: CountSchema, finished: CountSchema, skipped: CountSchema, open: CountSchema }, { additionalProperties: false }),
  effortDuringPeriod: Type.Object({ sessionSeconds: CountSchema, sessionCount: CountSchema }, { additionalProperties: false }),
  eventsDuringPeriod: Type.Object({
    finished: CountSchema,
    skipped: CountSchema,
    reopened: CountSchema,
    carriedForward: CountSchema,
    decisionsReviewed: CountSchema,
    thoughtsCaptured: CountSchema,
  }, { additionalProperties: false }),
  outcomes: Type.Object({ achieved: CountSchema, partial: CountSchema, notAchieved: CountSchema }, { additionalProperties: false }),
  taskRows: Type.Array(Type.Object({
    task: TaskProjectionSchema, statusAtPeriodEnd: TaskStatusSchema, currentStatus: TaskStatusSchema, actualSecondsAllTime: CountSchema,
  }, { additionalProperties: false })),
  thoughts: Type.Array(JourneyEntrySchema), changedMyMindCount: CountSchema,
  openWork: Type.Array(TaskProjectionSchema),
  reflection: Type.Object({ prompt: Type.Union([Type.String(), Type.Null()]), entry: Type.Union([JourneyEntrySchema, Type.Null()]) }, { additionalProperties: false }),
}, { additionalProperties: false });

export const CarryForwardResponseSchema = Type.Object({
  source: TaskProjectionSchema,
  completion: Type.Object({ taskId: Type.String(), finishEventId: Type.String(), reviewId: Type.String(), outcome: Type.Literal("PARTIAL"), undoUntil: Type.String() }, { additionalProperties: false }),
  continuation: TaskProjectionSchema,
  dashboard: DashboardSchema,
}, { additionalProperties: false });

export type JourneyEntryContract = Static<typeof JourneyEntrySchema>;
export type JourneyTimelineContract = Static<typeof JourneyTimelineSchema>;
export type ActivityContract = Static<typeof ActivitySchema>;
export type SessionProjectionContract = Static<typeof SessionProjectionSchema>;
export type TaskDetailContract = Static<typeof TaskDetailSchema>;
export type TaskListContract = Static<typeof TaskListSchema>;
export type MilestoneSummaryContract = Static<typeof MilestoneSummarySchema>;
export type CarryForwardResponseContract = Static<typeof CarryForwardResponseSchema>;
