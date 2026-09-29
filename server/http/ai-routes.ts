import type { FastifyBaseLogger, FastifyInstance, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerDefault } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type, type TSchema } from "@sinclair/typebox";
import { AIReviewListSchema, AIReviewSchema } from "../../shared/contracts/index.js";
import type { AIReviewTargetType } from "../domain/journey-state.js";
import { AppError } from "../application/app-error.js";
import { AIReviewService } from "../application/ai/ai-review-service.js";
import type { AIReviewer } from "../ports/ai-reviewer.js";
import type { Clock } from "../ports/clock.js";
import type { CurrentUserProvider } from "../adapters/local-current-user-provider.js";
import type { IdGenerator } from "../ports/id-generator.js";
import type { JourneyStore } from "../ports/journey-store.js";

const Id = Type.String({ minLength: 1, maxLength: 128, pattern: "^[a-z0-9][a-z0-9._-]*$" });
const EmptyBody = Type.Object({}, { additionalProperties: false });
const WeekBody = Type.Object({ milestoneId: Id }, { additionalProperties: false });
const ListQuery = Type.Object({ targetType: Type.Union([Type.Literal("TASK"), Type.Literal("WEEK"), Type.Literal("QUARTER"), Type.Literal("DECISION")]), targetId: Id }, { additionalProperties: false });

function commandKey(headers: Record<string, string | string[] | undefined>): string {
  const value = headers["idempotency-key"];
  if (typeof value !== "string" || value.length < 16 || value.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(value)) {
    throw new AppError(422, "VALIDATION_FAILED", "The action key is not valid", "Supply a valid action key and try again.");
  }
  return value;
}

export function registerAIRoutes<TLogger extends FastifyBaseLogger>(
  app: FastifyInstance<RawServerDefault, RawRequestDefaultExpression<RawServerDefault>, RawReplyDefaultExpression<RawServerDefault>, TLogger, TypeBoxTypeProvider>,
  options: { store: JourneyStore; currentUserProvider: CurrentUserProvider; clock: Clock; idGenerator: IdGenerator; reviewer: AIReviewer },
): void {
  const service = new AIReviewService(options.store, options.currentUserProvider, options.clock, options.idGenerator, options.reviewer);
  app.get("/api/ai/reviews", { schema: { querystring: ListQuery, response: { 200: AIReviewListSchema } } }, async (request) => {
    const query = request.query as { targetType: AIReviewTargetType; targetId: string };
    return service.list(query.targetType, query.targetId);
  });

  const register = (targetType: AIReviewTargetType, path: string, bodySchema: TSchema, targetId: (params: { id?: string }, body: { milestoneId?: string }) => string) => {
    const params = path.includes(":id") ? Type.Object({ id: Id }, { additionalProperties: false }) : Type.Object({}, { additionalProperties: false });
    app.post(path, { schema: { params, body: bodySchema, response: { 201: AIReviewSchema } } }, async (request, reply) => {
      const id = targetId(request.params as { id?: string }, request.body as { milestoneId?: string });
      const route = path.replace(":id", id);
      const result = await service.create(targetType, id, commandKey(request.headers), route);
      if (result.replayed) reply.header("Idempotency-Replayed", "true");
      return reply.code(201).send(result.review);
    });
  };

  register("TASK", "/api/ai/review/task/:id", EmptyBody, (params) => params.id!);
  register("WEEK", "/api/ai/review/week", WeekBody, (_params, body) => body.milestoneId!);
  register("QUARTER", "/api/ai/review/quarter/:id", EmptyBody, (params) => params.id!);
  register("DECISION", "/api/ai/review/decision/:id", EmptyBody, (params) => params.id!);
}
