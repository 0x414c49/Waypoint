import { Type, type Static } from "@sinclair/typebox";

export const CurrentUserSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    name: Type.String({ minLength: 1, maxLength: 120 }),
    timeZone: Type.String({ minLength: 1, maxLength: 100 }),
    createdAt: Type.String({ minLength: 20 }),
  },
  { additionalProperties: false, $id: "CurrentUser" },
);

export type CurrentUser = Static<typeof CurrentUserSchema>;
