// Public one-click email preference endpoints. No session is required: the
// signed token in the link is the credential (see preferences.ts). Both
// endpoints are rate-limited by IP and return the same invalid-link shape for
// forged tokens and removed accounts so the endpoint is not a user oracle.

import type { FastifyBaseLogger, FastifyInstance, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerDefault } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { AppError } from "../application/app-error.js";
import { escapeHtml } from "../email/mailer.js";
import { EmailPreferenceService } from "../email/preferences.js";

const TokenQuery = Type.Object({ token: Type.String({ minLength: 1, maxLength: 500 }) }, { additionalProperties: false });

function page(title: string, heading: string, body: string): string {
  return [
    "<!DOCTYPE html>",
    '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    "<style>body{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;background:#F2F5F3;color:#162127;margin:0;padding:48px 20px}.card{max-width:520px;margin:0 auto;background:#FCFDFC;border:1px solid #D5DEDA;border-radius:12px;padding:32px}h1{font-size:22px;margin:0 0 8px}p{color:#3E545C}button{background:#315F7C;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:15px;cursor:pointer}</style>",
    "</head><body><main class=\"card\">",
    `<h1>${escapeHtml(heading)}</h1>${body}`,
    "</main></body></html>",
  ].join("\n");
}

export function registerEmailRoutes<TLogger extends FastifyBaseLogger>(
  app: FastifyInstance<RawServerDefault, RawRequestDefaultExpression<RawServerDefault>, RawReplyDefaultExpression<RawServerDefault>, TLogger, TypeBoxTypeProvider>,
  options: {
    preferences: EmailPreferenceService;
    limited: (kind: string, key: string) => void;
  },
): void {
  app.get("/api/email/unsubscribe", { schema: { querystring: TokenQuery } }, async (request, reply) => {
    const query = request.query as { token: string };
    options.limited("email-unsub", request.ip);
    try {
      await options.preferences.setDigestUnsubscribed(query.token, true);
    } catch (error) {
      if (error instanceof AppError && error.status === 404) {
        return reply.code(404).type("application/problem+json").send({ error: "That link is not valid." });
      }
      throw error;
    }
    return reply.type("text/html").send(page(
      "Unsubscribed from the weekly digest",
      "You're unsubscribed",
      `<p>You will no longer receive the Waypoint weekly digest at this address. Your learning log is unchanged.</p><p><a href="/api/email/resubscribe?token=${escapeHtml(encodeURIComponent(query.token))}">Resubscribe</a></p>`,
    ));
  });

  app.get("/api/email/resubscribe", { schema: { querystring: TokenQuery } }, async (request, reply) => {
    const query = request.query as { token: string };
    options.limited("email-unsub", request.ip);
    try {
      await options.preferences.setDigestUnsubscribed(query.token, false);
    } catch (error) {
      if (error instanceof AppError && error.status === 404) {
        return reply.code(404).type("application/problem+json").send({ error: "That link is not valid." });
      }
      throw error;
    }
    return reply.type("text/html").send(page(
      "Subscribed to the weekly digest",
      "You're subscribed again",
      "<p>You will receive the Waypoint weekly digest again.</p>",
    ));
  });
}
