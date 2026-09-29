import { Type, type Static } from "@sinclair/typebox";

const RecordIdSchema = Type.String({ minLength: 1, maxLength: 128, pattern: "^[a-z0-9][a-z0-9._-]*$" });

const QuarterSummarySchema = Type.Object({
  id: RecordIdSchema,
  title: Type.String(),
  startDate: Type.String(),
  endDate: Type.String(),
  phase: Type.Union([Type.Literal("CURRENT"), Type.Literal("FUTURE"), Type.Literal("PAST")]),
  planRevision: Type.Integer({ minimum: 1 }),
  etag: Type.String(),
}, { additionalProperties: false });

export const QuarterListSchema = Type.Object({ items: Type.Array(QuarterSummarySchema) }, { additionalProperties: false });
export type QuarterListContract = Static<typeof QuarterListSchema>;

export const QuarterDetailSchema = Type.Object({
  id: RecordIdSchema,
  title: Type.String(),
  description: Type.Optional(Type.String()),
  mantra: Type.Optional(Type.String()),
  startDate: Type.String(),
  endDate: Type.String(),
  phase: Type.Union([Type.Literal("CURRENT"), Type.Literal("FUTURE"), Type.Literal("PAST")]),
  planRevision: Type.Integer({ minimum: 1 }),
  etag: Type.String(),
  successCriteria: Type.Array(Type.Object({ id: RecordIdSchema, text: Type.String(), position: Type.Integer({ minimum: 0 }) }, { additionalProperties: false })),
  focusAreas: Type.Array(Type.Object({
    id: RecordIdSchema, name: Type.String(), description: Type.Optional(Type.String()),
    targetMinutes: Type.Optional(Type.Integer({ minimum: 1 })), position: Type.Integer({ minimum: 0 }),
  }, { additionalProperties: false })),
  milestones: Type.Array(Type.Object({
    id: RecordIdSchema, title: Type.String(), description: Type.Optional(Type.String()),
    startDate: Type.String(), endDate: Type.String(), mode: Type.Union([
      Type.Literal("STANDARD"), Type.Literal("LIGHT"), Type.Literal("BUFFER"), Type.Literal("RETRO"),
    ]), position: Type.Integer({ minimum: 0 }), taskCount: Type.Integer({ minimum: 0 }),
  }, { additionalProperties: false })),
  tasks: Type.Array(Type.Object({
    id: RecordIdSchema, title: Type.String(), plannedDate: Type.String(),
    focusAreaId: Type.Optional(RecordIdSchema), milestoneId: RecordIdSchema,
    recommendationMode: Type.Union([Type.Literal("DEFAULT"), Type.Literal("WHEN_CLEAR"), Type.Literal("OPTIONAL")]),
  }, { additionalProperties: false })),
}, { additionalProperties: false });
export type QuarterDetailContract = Static<typeof QuarterDetailSchema>;
