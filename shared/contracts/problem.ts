import { Type, type Static } from "@sinclair/typebox";

export const ProblemDetailsSchema = Type.Object(
  {
    type: Type.String(),
    title: Type.String(),
    status: Type.Integer({ minimum: 400, maximum: 599 }),
    code: Type.String(),
    detail: Type.String(),
    instance: Type.Optional(Type.String()),
    traceId: Type.String(),
  },
  { additionalProperties: true, $id: "ProblemDetails" },
);

export type ProblemDetails = Static<typeof ProblemDetailsSchema>;
