import type { FastifyBaseLogger, FastifyInstance, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerDefault } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { PlanApplyRequestSchema, PlanApplyResponseSchema, PlanPreviewRequestSchema, PlanPreviewSchema } from "../../shared/contracts/index.js";
import type { CurrentUserProvider } from "../adapters/local-current-user-provider.js";
import { AppError } from "../application/app-error.js";
import { PlanCommandService } from "../application/plans/plan-command-service.js";
import type { Clock } from "../ports/clock.js";
import type { IdGenerator } from "../ports/id-generator.js";
import type { JourneyStore } from "../ports/journey-store.js";

const QuarterParams = Type.Object({ quarterId: Type.String({ minLength: 1, maxLength: 128, pattern: "^[a-z0-9][a-z0-9._-]*$" }) }, { additionalProperties: false });

function commandKey(headers: Record<string, string | string[] | undefined>): string {
  const value = headers["idempotency-key"];
  if (typeof value !== "string" || value.length < 16 || value.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(value)) {
    throw new AppError(422, "VALIDATION_FAILED", "The action key is not valid", "Supply a valid action key and try again.");
  }
  return value;
}

function applyPrecondition(headers: Record<string, string | string[] | undefined>) {
  const ifMatch = headers["if-match"];
  const ifNoneMatch = headers["if-none-match"];
  if (ifMatch !== undefined && typeof ifMatch !== "string") throw new AppError(422, "VALIDATION_FAILED", "The plan version is not valid", "Refresh the preview and try again.");
  if (ifNoneMatch !== undefined && typeof ifNoneMatch !== "string") throw new AppError(422, "VALIDATION_FAILED", "The create precondition is not valid", "Refresh the preview and try again.");
  if (ifMatch && ifNoneMatch) throw new AppError(422, "VALIDATION_FAILED", "Choose one plan precondition", "Use the preview ETag for an update or If-None-Match: * for a new Quarter.");
  return { ...(ifMatch ? { ifMatch } : {}), ...(ifNoneMatch ? { ifNoneMatch } : {}) };
}

export function registerPlanRoutes<TLogger extends FastifyBaseLogger>(app: FastifyInstance<RawServerDefault, RawRequestDefaultExpression<RawServerDefault>, RawReplyDefaultExpression<RawServerDefault>, TLogger, TypeBoxTypeProvider>, options: { store: JourneyStore; currentUserProvider: CurrentUserProvider; clock: Clock; idGenerator: IdGenerator }): void {
  const plans = new PlanCommandService(options.store, options.currentUserProvider, options.clock, options.idGenerator);
  app.post("/api/plans/preview", {
    bodyLimit: 2 * 1024 * 1024,
    schema: { body: PlanPreviewRequestSchema, response: { 200: PlanPreviewSchema } },
  }, async (request) => plans.preview((request.body as { content: string }).content));

  app.post("/api/plans/apply", {
    schema: { body: PlanApplyRequestSchema, response: { 200: PlanApplyResponseSchema, 201: PlanApplyResponseSchema } },
  }, async (request, reply) => {
    const input = request.body as { previewToken: string; acknowledgementIds: string[] };
    const result = await plans.apply(input, commandKey(request.headers), applyPrecondition(request.headers));
    if (result.replayed) reply.header("Idempotency-Replayed", "true");
    reply.header("ETag", result.etag);
    return reply.code(result.mode === "CREATE_QUARTER" ? 201 : 200).send(result);
  });

  app.get("/api/plans/export/:quarterId", { schema: { params: QuarterParams } }, async (request, reply) => {
    const result = await plans.export((request.params as { quarterId: string }).quarterId);
    return reply.type("application/yaml; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="${result.filename}"`)
      .header("ETag", result.etag)
      .send(result.content);
  });
}
