import { Type, type Static } from "@sinclair/typebox";

export const AIReviewTargetTypeSchema = Type.Union([
  Type.Literal("TASK"),
  Type.Literal("WEEK"),
  Type.Literal("QUARTER"),
  Type.Literal("DECISION"),
]);

export const AIReviewSchema = Type.Object({
  id: Type.String(),
  targetType: AIReviewTargetTypeSchema,
  targetId: Type.String(),
  provider: Type.String(),
  model: Type.Union([Type.String(), Type.Null()]),
  summary: Type.Union([Type.String(), Type.Null()]),
  strengths: Type.Array(Type.String()),
  gaps: Type.Array(Type.String()),
  suggestedFollowUp: Type.Union([Type.String(), Type.Null()]),
  questions: Type.Array(Type.String()),
  generatedAt: Type.String(),
  timeZoneAtGeneration: Type.String(),
}, { additionalProperties: false });

export const AIReviewListSchema = Type.Object({
  items: Type.Array(AIReviewSchema),
}, { additionalProperties: false });

export type AIReviewTargetType = Static<typeof AIReviewTargetTypeSchema>;
export type AIReviewContract = Static<typeof AIReviewSchema>;
export type AIReviewListContract = Static<typeof AIReviewListSchema>;
