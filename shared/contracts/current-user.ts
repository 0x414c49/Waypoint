import { Type, type Static } from "@sinclair/typebox";

export const CurrentUserSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    name: Type.String({ minLength: 1, maxLength: 120 }),
    timeZone: Type.String({ minLength: 1, maxLength: 100 }),
    createdAt: Type.String({ minLength: 20 }),
    email: Type.Optional(Type.String({ minLength: 3, maxLength: 320 })),
    role: Type.Optional(Type.Union([Type.Literal("OWNER"), Type.Literal("MEMBER")])),
  },
  { additionalProperties: false, $id: "CurrentUser" },
);

export type CurrentUser = Static<typeof CurrentUserSchema>;
