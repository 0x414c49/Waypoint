import fastify from "fastify";
import staticFiles from "@fastify/static";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { resolve } from "node:path";
import {
  CurrentUserSchema,
  ProblemDetailsSchema,
} from "../../shared/contracts/index.js";
import type { CurrentUserProvider } from "../adapters/local-current-user-provider.js";
import type { JourneyStore } from "../ports/journey-store.js";
import type { IdGenerator } from "../ports/id-generator.js";
import type { Clock } from "../ports/clock.js";
import type { Logger } from "pino";
import { StoreError } from "../adapters/json-store/index.js";
import { AppError } from "../application/app-error.js";
import { problem } from "./problem.js";
import { registerTodayRoutes } from "./today-routes.js";
import { registerJourneyRoutes } from "./journey-routes.js";
import { registerDecisionRoutes } from "./decision-routes.js";

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
}

const mutatingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function buildApp(options: BuildAppOptions) {
  const app = fastify({
    bodyLimit: 256 * 1024,
    ajv: { customOptions: { removeAdditional: false } },
    loggerInstance: options.logger,
    genReqId: () => `trace-${options.idGenerator.generate()}`,
  }).withTypeProvider<TypeBoxTypeProvider>();

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
  });

  app.addHook("onSend", async (_request, reply, payload) => {
    reply
      .header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
      .header("X-Content-Type-Options", "nosniff")
      .header("X-Frame-Options", "DENY")
      .header("Referrer-Policy", "no-referrer")
      .header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
      .header("Cross-Origin-Resource-Policy", "same-origin");
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
      const userId = await options.currentUserProvider.getCurrentUserId();
      return options.store.read((state) => {
        const user = state.records.users[userId];
        if (!user) throw new Error("The current user disappeared from the validated snapshot.");
        return user;
      });
    },
  );

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
            "This request exceeds the 256 KiB JSON limit.",
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

  return app;
}
