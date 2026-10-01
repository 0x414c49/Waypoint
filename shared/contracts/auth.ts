import { Type, type Static } from "@sinclair/typebox";

export const AuthRoleSchema = Type.Union([Type.Literal("OWNER"), Type.Literal("MEMBER")]);
export const AuthUserSchema = Type.Object({
  id: Type.String({ minLength: 1 }), name: Type.String({ minLength: 1, maxLength: 120 }),
  email: Type.String({ minLength: 3, maxLength: 320 }), timeZone: Type.String({ minLength: 1, maxLength: 100 }),
  role: AuthRoleSchema, createdAt: Type.String({ minLength: 20 }),
}, { additionalProperties: false });
export const AuthSessionResponseSchema = Type.Object({ authenticated: Type.Boolean(), user: Type.Optional(AuthUserSchema) }, { additionalProperties: false });
export const AuthInviteViewSchema = Type.Object({
  id: Type.String({ minLength: 64, maxLength: 64 }), intendedEmail: Type.String({ minLength: 3, maxLength: 320 }), role: AuthRoleSchema,
  bootstrap: Type.Boolean(), createdAt: Type.String({ minLength: 20 }), expiresAt: Type.String({ minLength: 20 }),
  status: Type.Union([Type.Literal("pending"), Type.Literal("consumed"), Type.Literal("revoked"), Type.Literal("expired")]),
}, { additionalProperties: false });
export const AuthInviteListSchema = Type.Object({ items: Type.Array(AuthInviteViewSchema) }, { additionalProperties: false });
export const AuthInviteCreateResponseSchema = Type.Object({ inviteId: Type.String({ minLength: 1 }), invite: AuthInviteViewSchema }, { additionalProperties: false });
export const TotpSetupResponseSchema = Type.Object({
  secret: Type.String({ minLength: 32, maxLength: 32, pattern: "^[A-Z2-7]+$" }),
  qrDataUrl: Type.String({ minLength: 100, maxLength: 100_000, pattern: "^data:image/png;base64," }),
}, { additionalProperties: false });
export type AuthUser = Static<typeof AuthUserSchema>;
export type AuthSessionResponse = Static<typeof AuthSessionResponseSchema>;
export type AuthInviteView = Static<typeof AuthInviteViewSchema>;
export type AuthInviteList = Static<typeof AuthInviteListSchema>;
export type AuthInviteCreateResponse = Static<typeof AuthInviteCreateResponseSchema>;
export type TotpSetupResponse = Static<typeof TotpSetupResponseSchema>;
