import fastify from "fastify";
import staticFiles from "@fastify/static";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import QRCode from "qrcode";
import { resolve } from "node:path";
import {
  CurrentUserSchema,
  AuthInviteCreateResponseSchema,
  AuthInviteListSchema,
  AuthSessionResponseSchema,
  TotpSetupResponseSchema,
  ProblemDetailsSchema,
} from "../../shared/contracts/index.js";
import type { CurrentUserProvider } from "../adapters/local-current-user-provider.js";
import type { JourneyStore } from "../ports/journey-store.js";
import type { IdGenerator } from "../ports/id-generator.js";
import type { Clock } from "../ports/clock.js";
import type { Logger } from "pino";
import { StoreError } from "../adapters/store-errors.js";
import { AppError } from "../application/app-error.js";
import { problem } from "./problem.js";
import { registerTodayRoutes } from "./today-routes.js";
import { registerJourneyRoutes } from "./journey-routes.js";
import { registerDecisionRoutes } from "./decision-routes.js";
import { registerQuarterRoutes } from "./quarter-routes.js";
import { registerPlanRoutes } from "./plan-routes.js";
import { registerSearchRoutes } from "./search-routes.js";
import { registerEmailRoutes } from "./email-routes.js";
import { AuthService, readCookie, sessionCookie } from "../auth/auth-service.js";
import { AuthenticatedCurrentUserProvider } from "../adapters/authenticated-current-user-provider.js";
import { buildInviteEmail, type Mailer } from "../email/mailer.js";
import type { EmailPreferenceService } from "../email/preferences.js";

interface BuildAppOptions {
  readonly store: JourneyStore;
  readonly currentUserProvider: CurrentUserProvider;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly allowedHosts: ReadonlySet<string>;
  readonly allowedMutationOrigins: ReadonlySet<string>;
  readonly serveFrontend?: boolean;
  readonly registerTestRoutes?: boolean;
  readonly authService?: AuthService;
  readonly mailer?: Mailer | undefined;
  readonly publicUrl?: string | undefined;
  readonly emailPreferences?: EmailPreferenceService | undefined;
}

const mutatingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function buildApp(options: BuildAppOptions) {
  const app = fastify({
    bodyLimit: 256 * 1024,
    ajv: { customOptions: { removeAdditional: false } },
    loggerInstance: options.logger,
    genReqId: () => `trace-${options.idGenerator.generate()}`,
  }).withTypeProvider<TypeBoxTypeProvider>();
  const authEnabled = Boolean(options.authService);
  const authProvider = options.currentUserProvider instanceof AuthenticatedCurrentUserProvider ? options.currentUserProvider : undefined;
  const limiter = new Map<string, { count: number; resetAt: number }>();
  const authPublic = (url: string) => ["/api/auth/session", "/api/auth/totp/setup", "/api/auth/login", "/api/auth/register", "/api/auth/logout", "/api/email/unsubscribe", "/api/email/resubscribe"].includes(url.split("?")[0]!);
  const limited = (kind: string, key: string): void => {
    const now = Date.now();
    if (limiter.size >= 10_000) for (const [staleKey, bucket] of limiter) { if (bucket.resetAt <= now) limiter.delete(staleKey); if (limiter.size < 9_000) break; }
    const bucketKey = `${kind}:${key}`; const existing = limiter.get(bucketKey);
    if (!existing || existing.resetAt <= now) { limiter.set(bucketKey, { count: 1, resetAt: now + 15 * 60_000 }); return; }
    existing.count += 1;
    if (existing.count > 10) throw new AppError(429, "RATE_LIMITED", "Too many attempts", "Try again later.", { retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000) });
  };

  app.addHook("onRequest", async (request, reply) => {
    const host = request.headers.host;
    const trustedHost = host !== undefined && options.allowedHosts.has(host.toLowerCase());
    const origin = request.headers.origin;
    const trustedOrigin = origin !== undefined && options.allowedMutationOrigins.has(origin);
    if (!trustedHost || (mutatingMethods.has(request.method) && !trustedOrigin)) {
      return reply
        .code(403)
        .type("application/problem+json")
        .send(
          problem(
            request.id,
            request.url,
            "UNTRUSTED_ORIGIN",
            "This request is not trusted",
            403,
            "Open the tracker from its local address and try again.",
          ),
        );
    }
    if (authEnabled && request.url.startsWith("/api/") && !authPublic(request.url)) {
      const current = await options.authService!.authenticateToken(readCookie(request, options.authService!.cookieName));
      if (!current) return reply.code(401).type("application/problem+json").send(problem(request.id, request.url, "AUTHENTICATION_REQUIRED", "Authentication required", 401, "Sign in to use this local resource."));
      authProvider?.setRequestUser(request.id, current);
    }
  });

  app.addHook("onRequest", (request, _reply, done) => {
    if (authEnabled && authProvider && request.url.startsWith("/api/") && !authPublic(request.url)) authProvider.runRequest(request.id, done);
    else done();
  });
  app.addHook("onResponse", async (request) => {
    if (authProvider) authProvider.setRequestUser(request.id, undefined);
  });

  app.addHook("onSend", async (request, reply, payload) => {
    reply
      .header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
      .header("X-Content-Type-Options", "nosniff")
      .header("X-Frame-Options", "DENY")
      .header("Referrer-Policy", "no-referrer")
      .header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
      .header("Cross-Origin-Resource-Policy", "same-origin");
    if (authEnabled && request.url.startsWith("/api/")) reply.header("Cache-Control", "no-store");
    return payload;
  });

  app.get(
    "/api/me",
    {
      schema: {
        response: {
          200: CurrentUserSchema,
          500: ProblemDetailsSchema,
        },
      },
    },
    async () => {
      if (authProvider) return authProvider.getCurrentUser();
      const userId = await options.currentUserProvider.getCurrentUserId();
      return options.store.read((state) => {
        const user = state.records.users[userId];
        if (!user) throw new Error("The current user disappeared from the validated snapshot.");
        return user;
      });
    },
  );

  // The process only starts listening after the store has initialized, so a
  // successful response is a useful liveness/readiness signal for containers.
  // Host validation above still applies; this is not an unauthenticated data
  // endpoint and does not bypass the trusted-host boundary.
  app.get("/healthz", async (_request, reply) => reply.code(200).send({ status: "ok" }));

  if (authEnabled && authProvider) {
    const TotpSetupBody = Type.Object({ inviteId: Type.String({ minLength: 1, maxLength: 256 }), email: Type.String({ minLength: 3, maxLength: 320 }) }, { additionalProperties: false });
    const RegisterBody = Type.Object({ inviteId: Type.String({ minLength: 1, maxLength: 256 }), email: Type.String({ minLength: 3, maxLength: 320 }), name: Type.String({ minLength: 1, maxLength: 120 }), timeZone: Type.String({ minLength: 1, maxLength: 100 }), password: Type.String({ minLength: 1, maxLength: 256 }), totpSecret: Type.Optional(Type.String({ minLength: 32, maxLength: 32, pattern: "^[A-Z2-7]+$" })), totpCode: Type.Optional(Type.String({ minLength: 6, maxLength: 6, pattern: "^\\d{6}$" })) }, { additionalProperties: false });
    const LoginBody = Type.Object({ email: Type.String({ minLength: 3, maxLength: 320 }), password: Type.String({ minLength: 1, maxLength: 256 }), totpCode: Type.Optional(Type.String({ minLength: 6, maxLength: 6, pattern: "^\\d{6}$" })) }, { additionalProperties: false });
    const InviteBody = Type.Object({ email: Type.String({ minLength: 3, maxLength: 320 }) }, { additionalProperties: false });
    const InviteParams = Type.Object({ id: Type.String({ minLength: 64, maxLength: 64, pattern: "^[a-f0-9]+$" }) }, { additionalProperties: false });
    const EmailPreferencesBody = Type.Object({ digestUnsubscribed: Type.Boolean() }, { additionalProperties: false });
    const EmailPreferencesResponse = Type.Object({ digestUnsubscribed: Type.Boolean() }, { additionalProperties: false });
    const secureCookie = options.authService!.cookieName.startsWith("__Host-");
    app.get("/api/auth/session", { schema: { response: { 200: AuthSessionResponseSchema } } }, async (request) => {
      const current = await options.authService!.authenticateToken(readCookie(request, options.authService!.cookieName));
      return current ? { authenticated: true, user: current } : { authenticated: false };
    });
    app.post("/api/auth/totp/setup", { schema: { body: TotpSetupBody, response: { 200: TotpSetupResponseSchema } } }, async (request) => {
      const input = request.body as { inviteId: string; email: string };
      limited("totp-setup", `${input.email.trim().toLowerCase()}|${request.ip}`);
      const enrollment = await options.authService!.prepareTotpEnrollment(input.inviteId, input.email);
      const qrDataUrl = await QRCode.toDataURL(enrollment.uri, { errorCorrectionLevel: "M", margin: 2, width: 240, color: { dark: "#162127ff", light: "#ffffffff" } });
      return { secret: enrollment.secret, qrDataUrl };
    });
    app.post("/api/auth/register", { schema: { body: RegisterBody, response: { 201: AuthSessionResponseSchema } } }, async (request, reply) => {
      const input = request.body as { inviteId: string; email: string; name: string; timeZone: string; password: string; totpSecret?: string; totpCode?: string };
      limited("register", `${input.email.trim().toLowerCase()}|${request.ip}`);
      const result = await options.authService!.register(input);
      return reply.header("Set-Cookie", sessionCookie(options.authService!.cookieName, result.token, secureCookie)).code(201).send({ authenticated: true, user: result.user });
    });
    app.post("/api/auth/login", { schema: { body: LoginBody, response: { 200: AuthSessionResponseSchema } } }, async (request, reply) => {
      const input = request.body as { email: string; password: string; totpCode?: string };
      limited("login", `${input.email.trim().toLowerCase()}|${request.ip}`);
      const result = await options.authService!.login(input.email, input.password, input.totpCode);
      return reply.header("Set-Cookie", sessionCookie(options.authService!.cookieName, result.token, secureCookie)).send({ authenticated: true, user: result.user });
    });
    app.post("/api/auth/logout", async (request, reply) => {
      await options.authService!.logout(readCookie(request, options.authService!.cookieName));
      return reply.header("Set-Cookie", sessionCookie(options.authService!.cookieName, null, secureCookie)).code(204).send();
    });
    app.get("/api/auth/invites", { schema: { response: { 200: AuthInviteListSchema } } }, async () => {
      const current = await authProvider.getCurrentUser();
      if (current.role !== "OWNER") throw new AppError(403, "FORBIDDEN", "Forbidden", "Owner access is required.");
      return { items: await options.authService!.listInvites() };
    });
    app.post("/api/auth/invites", { schema: { body: InviteBody, response: { 201: AuthInviteCreateResponseSchema } } }, async (request, reply) => {
      const current = await authProvider.getCurrentUser();
      if (current.role !== "OWNER") throw new AppError(403, "FORBIDDEN", "Forbidden", "Owner access is required.");
      const result = await options.authService!.createInvite(current, (request.body as { email: string }).email);
      // Best-effort invite email: a delivery failure must never lose the
      // invite itself, so the raw ID is still returned and the failure is logged.
      let emailSent = false;
      if (options.mailer?.configured) {
        const registerUrl = options.publicUrl ? `${options.publicUrl}/register` : "/register";
        const content = buildInviteEmail({ registerUrl, inviteId: result.rawInviteId, inviterName: current.name, expiresAt: result.invite.expiresAt });
        try {
          const sent = await options.mailer.send({ to: result.invite.intendedEmail, subject: content.subject, text: content.text, html: content.html });
          emailSent = sent.sent;
        } catch (error) {
          request.log.warn({ err: error, inviteId: result.invite.id }, "Invite email could not be delivered; the invite remains valid for manual sharing.");
        }
      }
      return reply.code(201).send({ inviteId: result.rawInviteId, invite: result.invite, emailSent });
    });
    app.delete("/api/auth/invites/:id", { schema: { params: InviteParams } }, async (request, reply) => {
      const current = await authProvider.getCurrentUser();
      if (current.role !== "OWNER") throw new AppError(403, "FORBIDDEN", "Forbidden", "Owner access is required.");
      await options.authService!.revokeInvite((request.params as { id: string }).id);
      return reply.code(204).send();
    });
    if (options.emailPreferences) {
      const preferences = options.emailPreferences;
      app.get("/api/email/preferences", { schema: { response: { 200: EmailPreferencesResponse } } }, async () => {
        const current = await authProvider.getCurrentUser();
        return { digestUnsubscribed: await preferences.isDigestUnsubscribed(current.id) };
      });
      app.post("/api/email/preferences", { schema: { body: EmailPreferencesBody, response: { 200: EmailPreferencesResponse } } }, async (request) => {
        const current = await authProvider.getCurrentUser();
        const input = request.body as { digestUnsubscribed: boolean };
        await preferences.setDigestUnsubscribedByUser(current.id, input.digestUnsubscribed);
        return { digestUnsubscribed: await preferences.isDigestUnsubscribed(current.id) };
      });
    }
  }

  if (options.registerTestRoutes) {
    app.post(
      "/api/test/body",
      {
        schema: {
          body: Type.Object(
            { value: Type.String() },
            { additionalProperties: false },
          ),
        },
      },
      async (_request, reply) => reply.code(204).send(),
    );
  }

  if (options.serveFrontend) {
    await app.register(staticFiles, {
      root: resolve(process.cwd(), "dist/client"),
      wildcard: false,
    });
  }

  app.setNotFoundHandler(async (request, reply) => {
    if (options.serveFrontend && !request.url.startsWith("/api/")) {
      return reply.sendFile("index.html");
    }
    return reply
      .code(404)
      .type("application/problem+json")
      .send(
        problem(
          request.id,
          request.url,
          "RESOURCE_NOT_FOUND",
          "Resource not found",
          404,
          "That local resource does not exist.",
        ),
      );
  });

  app.setErrorHandler(async (error, request, reply) => {
    request.log.error({ err: error, traceId: request.id }, "Request failed");
    if (reply.sent) return;

    if (error instanceof StoreError) {
      const status = error.code === "STORE_WRITE_FAILED" ? 500 : 503;
      return reply
        .code(status)
        .type("application/problem+json")
        .send(
          problem(
            request.id,
            request.url,
            error.code,
            "The local store is unavailable",
            status,
            error.code === "STORE_BUSY"
              ? "The local store is busy. Try again shortly."
              : "Stop normal use and follow the recovery guidance in the local terminal.",
          ),
        );
    }

    if (error instanceof AppError) {
      if (error.status === 429 && typeof error.extensions.retryAfterSeconds === "number") reply.header("Retry-After", String(error.extensions.retryAfterSeconds));
      return reply
        .code(error.status)
        .type("application/problem+json")
        .send(
          problem(
            request.id,
            request.url,
            error.code,
            error.title,
            error.status,
            error.message,
            error.extensions,
          ),
        );
    }

    const fastifyError = error as typeof error & {
      code?: string;
      statusCode?: number;
      validation?: unknown;
    };
    if (fastifyError.code === "FST_ERR_CTP_BODY_TOO_LARGE" || fastifyError.statusCode === 413) {
      return reply
        .code(413)
        .type("application/problem+json")
        .send(
          problem(
            request.id,
            request.url,
            "PAYLOAD_TOO_LARGE",
            "The request is too large",
            413,
            request.url.startsWith("/api/plans/preview")
              ? "This plan preview request exceeds the 2 MiB JSON-wrapper limit."
              : "This request exceeds the 256 KiB JSON limit.",
          ),
        );
    }

    if (fastifyError.validation) {
      return reply
        .code(422)
        .type("application/problem+json")
        .send(problem(request.id, request.url, "VALIDATION_FAILED", "The request is not valid", 422, "Correct the request values and try again."));
    }

    if (fastifyError.statusCode === 400) {
      return reply
        .code(400)
        .type("application/problem+json")
        .send(
          problem(
            request.id,
            request.url,
            "MALFORMED_REQUEST",
            "The request could not be read",
            400,
            "Check the JSON request and try again.",
          ),
        );
    }

    return reply
      .code(500)
      .type("application/problem+json")
      .send(
        problem(
          request.id,
          request.url,
          "INTERNAL_ERROR",
          "Something went wrong",
          500,
          "The request could not be completed. Check the local logs using the trace ID.",
        ),
      );
  });

  registerTodayRoutes(app, options);
  registerJourneyRoutes(app, options);
  registerDecisionRoutes(app, options);
  registerQuarterRoutes(app, options);
  registerPlanRoutes(app, options);
  registerSearchRoutes(app, options);
  if (options.emailPreferences) {
    registerEmailRoutes(app, { preferences: options.emailPreferences, limited: (kind, key) => limited(kind, key) });
  }

  return app;
}
