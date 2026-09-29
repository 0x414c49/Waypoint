import { Type, type Static } from "@sinclair/typebox";

const NullableString = Type.Union([Type.String(), Type.Null()]);
export const DecisionStatusSchema = Type.Union([
  Type.Literal("DRAFT"), Type.Literal("ACCEPTED"), Type.Literal("SUPERSEDED"),
]);
export const DecisionReviewOutcomeSchema = Type.Union([
  Type.Literal("HOLDS"), Type.Literal("ADJUST"), Type.Literal("SUPERSEDE"), Type.Literal("DEFERRED"),
]);
export const DecisionOptionSchema = Type.Object({
  id: Type.String(), title: Type.String(), description: Type.String(),
  strengths: Type.Array(Type.String()), weaknesses: Type.Array(Type.String()),
}, { additionalProperties: false });
const DecisionRelationSchema = Type.Object({ id: Type.String(), title: Type.String() }, { additionalProperties: false });

export const DecisionReviewSchema = Type.Object({
  id: Type.String(), sequence: Type.Integer({ minimum: 1 }), reviewedAt: Type.String(),
  timeZoneAtReview: Type.String(), outcome: DecisionReviewOutcomeSchema,
  notes: NullableString, nextReviewDate: NullableString,
  replacementDecision: Type.Union([DecisionRelationSchema, Type.Null()]),
}, { additionalProperties: false });

export const DecisionSummarySchema = Type.Object({
  id: Type.String(), title: Type.String(), status: DecisionStatusSchema,
  decisionDate: NullableString, quarterId: NullableString,
  relatedTask: Type.Union([DecisionRelationSchema, Type.Null()]),
  supersedesDecisionId: NullableString, currentDueDate: NullableString,
  updatedAt: Type.String(), href: Type.String(),
}, { additionalProperties: false });

export const DecisionDetailSchema = Type.Object({
  id: Type.String(), etag: Type.String(), userId: Type.String(),
  title: Type.String(), decisionDate: NullableString, status: DecisionStatusSchema,
  quarterId: NullableString,
  relatedTask: Type.Union([DecisionRelationSchema, Type.Null()]),
  supersedesDecision: Type.Union([DecisionRelationSchema, Type.Null()]),
  context: NullableString, constraints: Type.Array(Type.String()),
  options: Type.Array(DecisionOptionSchema), decision: NullableString,
  consequences: NullableString, assumptions: Type.Array(Type.String()),
  falsifier: NullableString, initialReviewDate: NullableString,
  currentDueDate: NullableString, reviews: Type.Array(DecisionReviewSchema),
  createdAt: Type.String(), updatedAt: Type.String(),
}, { additionalProperties: false });

export const DecisionListSchema = Type.Object({
  items: Type.Array(DecisionSummarySchema),
  nextCursor: Type.Union([Type.String(), Type.Null()]),
}, { additionalProperties: false });

export type DecisionOptionContract = Static<typeof DecisionOptionSchema>;
export type DecisionReviewContract = Static<typeof DecisionReviewSchema>;
export type DecisionSummaryContract = Static<typeof DecisionSummarySchema>;
export type DecisionDetailContract = Static<typeof DecisionDetailSchema>;
export type DecisionListContract = Static<typeof DecisionListSchema>;
