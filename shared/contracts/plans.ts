import { Type, type Static } from "@sinclair/typebox";

const RecordIdSchema = Type.String({ minLength: 1, maxLength: 128, pattern: "^[a-z0-9][a-z0-9._-]*$" });

const PlanChangeKind = Type.Union([
  Type.Literal("ADDED"), Type.Literal("CHANGED"), Type.Literal("REMOVED"),
  Type.Literal("HISTORICAL_PRESERVED"), Type.Literal("CONFLICT"),
]);
const PlanEntityType = Type.Union([
  Type.Literal("QUARTER"), Type.Literal("FOCUS_AREA"), Type.Literal("MILESTONE"), Type.Literal("TASK"),
]);

export const PlanPreviewSchema = Type.Object({
  previewToken: Type.String({ minLength: 1 }),
  expiresAt: Type.String(),
  mode: Type.Union([Type.Literal("CREATE_QUARTER"), Type.Literal("UPDATE_QUARTER")]),
  quarterId: RecordIdSchema,
  basePlanRevision: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  baseEtag: Type.Union([Type.String(), Type.Null()]),
  summary: Type.Object({
    added: Type.Integer({ minimum: 0 }),
    changed: Type.Integer({ minimum: 0 }),
    removed: Type.Integer({ minimum: 0 }),
    historicalPreserved: Type.Integer({ minimum: 0 }),
    conflicts: Type.Integer({ minimum: 0 }),
  }, { additionalProperties: false }),
  changes: Type.Array(Type.Object({
    kind: PlanChangeKind,
    operation: Type.Union([Type.Literal("ADD"), Type.Literal("UPDATE"), Type.Literal("REMOVE")]),
    entityType: PlanEntityType,
    id: RecordIdSchema,
    label: Type.String(),
    explanation: Type.String(),
    before: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    after: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    historyPreserved: Type.Boolean(),
  }, { additionalProperties: false })),
  requiredAcknowledgements: Type.Array(Type.Object({
    id: Type.String(),
    code: Type.Union([Type.Literal("CONFIRM_PLAN_REMOVAL"), Type.Literal("PRESERVE_ACTIVE_WORK")]),
    description: Type.String(),
  }, { additionalProperties: false })),
}, { additionalProperties: false });
export type PlanPreviewContract = Static<typeof PlanPreviewSchema>;

export const PlanPreviewRequestSchema = Type.Object({
  sourceFormat: Type.Literal("yaml"),
  content: Type.String({ minLength: 1, maxLength: 1_048_576 }),
}, { additionalProperties: false });

export const PlanApplyRequestSchema = Type.Object({
  previewToken: Type.String({ minLength: 1, maxLength: 256 }),
  acknowledgementIds: Type.Array(Type.String({ minLength: 1, maxLength: 256 }), { maxItems: 5_500 }),
}, { additionalProperties: false });

export const PlanApplyResponseSchema = Type.Object({
  mode: Type.Union([Type.Literal("CREATE_QUARTER"), Type.Literal("UPDATE_QUARTER")]),
  quarterId: RecordIdSchema,
  planRevision: Type.Integer({ minimum: 1 }),
  etag: Type.String(),
  changed: Type.Boolean(),
}, { additionalProperties: false });
export type PlanApplyResponseContract = Static<typeof PlanApplyResponseSchema>;
