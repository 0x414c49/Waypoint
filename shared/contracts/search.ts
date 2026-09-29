import { Type, type Static } from "@sinclair/typebox";

export const SearchGroupTypeSchema = Type.Union([
  Type.Literal("PLAN"),
  Type.Literal("JOURNEY"),
  Type.Literal("DECISION"),
]);

export const SearchContentTypeSchema = Type.Union([
  Type.Literal("TASK"),
  Type.Literal("QUARTER"),
  Type.Literal("FOCUS_AREA"),
  Type.Literal("MILESTONE"),
  Type.Literal("THOUGHT"),
  Type.Literal("DECISION"),
]);

export const SearchResultSchema = Type.Object({
  contentType: SearchContentTypeSchema,
  id: Type.String(),
  title: Type.String(),
  excerpt: Type.String(),
  quarterId: Type.Union([Type.String(), Type.Null()]),
  focusAreaId: Type.Union([Type.String(), Type.Null()]),
  milestoneId: Type.Union([Type.String(), Type.Null()]),
  taskId: Type.Union([Type.String(), Type.Null()]),
  journeyEntryId: Type.Union([Type.String(), Type.Null()]),
  decisionId: Type.Union([Type.String(), Type.Null()]),
  occurredAt: Type.Union([Type.String(), Type.Null()]),
}, { additionalProperties: false });

export const SearchGroupSchema = Type.Object({
  type: SearchGroupTypeSchema,
  items: Type.Array(SearchResultSchema),
}, { additionalProperties: false });

export const SearchResponseSchema = Type.Object({
  query: Type.String(),
  groups: Type.Array(SearchGroupSchema),
  nextCursor: Type.Union([Type.String(), Type.Null()]),
}, { additionalProperties: false });

export type SearchGroupType = Static<typeof SearchGroupTypeSchema>;
export type SearchContentType = Static<typeof SearchContentTypeSchema>;
export type SearchResultContract = Static<typeof SearchResultSchema>;
export type SearchResponseContract = Static<typeof SearchResponseSchema>;
