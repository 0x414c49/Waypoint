import type { FastifyBaseLogger, FastifyInstance, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerDefault } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { DecisionDetailSchema, DecisionListSchema } from "../../shared/contracts/index.js";
import type { CurrentUserProvider } from "../adapters/local-current-user-provider.js";
import { AppError, notFound } from "../application/app-error.js";
import { DecisionCommandService, type DecisionDraftInput, type DecisionEditInput, type DecisionReviewInput } from "../application/decisions/decision-command-service.js";
import { projectDecisionDetail, projectDecisionList } from "../application/decisions/decision-projection.js";
import { localDate } from "../application/dashboard/temporal.js";
import type { Clock } from "../ports/clock.js";
import type { IdGenerator } from "../ports/id-generator.js";
import type { JourneyStore } from "../ports/journey-store.js";

const Id = Type.String({ minLength: 1, maxLength: 128, pattern: "^[a-z0-9][a-z0-9._-]*$" });
const DateValue = Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });
const NullableDate = Type.Union([DateValue, Type.Null()]);
const NullableId = Type.Union([Id, Type.Null()]);
const LongText = Type.String({ minLength: 1, maxLength: 20_000 });
const Params = Type.Object({ id: Id }, { additionalProperties: false });
const CreateBody = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 200 }), quarterId: Type.Optional(NullableId),
  relatedTaskId: Type.Optional(NullableId), initialReviewDate: Type.Optional(NullableDate),
}, { additionalProperties: false });
const Option = Type.Object({
  id: Id, title: Type.String({ minLength: 1, maxLength: 200 }), description: LongText,
  strengths: Type.Array(LongText, { maxItems: 20 }), weaknesses: Type.Array(LongText, { maxItems: 20 }),
}, { additionalProperties: false });
const UpdateBody = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 200 }), decisionDate: Type.Optional(NullableDate),
  context: Type.Optional(Type.Union([LongText, Type.Null()])), constraints: Type.Array(LongText, { maxItems: 20 }),
  options: Type.Array(Option, { maxItems: 20 }), decision: Type.Optional(Type.Union([LongText, Type.Null()])),
  consequences: Type.Optional(Type.Union([LongText, Type.Null()])), assumptions: Type.Array(LongText, { maxItems: 20 }),
  falsifier: Type.Optional(Type.Union([LongText, Type.Null()])), initialReviewDate: Type.Optional(NullableDate),
}, { additionalProperties: false });
const AcceptBody = Type.Object({ decisionDate: Type.Optional(NullableDate) }, { additionalProperties: false });
const ReviewBody = Type.Object({
  outcome: Type.Union([Type.Literal("HOLDS"), Type.Literal("ADJUST"), Type.Literal("SUPERSEDE"), Type.Literal("DEFERRED")]),
  notes: Type.Optional(Type.Union([LongText, Type.Null()])), nextReviewDate: Type.Optional(NullableDate),
  replacementDecisionId: Type.Optional(NullableId),
}, { additionalProperties: false });
const ListQuery = Type.Object({
  quarterId: Type.Optional(Id), status: Type.Optional(Type.Union([Type.Literal("DRAFT"), Type.Literal("ACCEPTED"), Type.Literal("SUPERSEDED")])),
  review: Type.Optional(Type.Literal("due")), cursor: Type.Optional(Type.String({ maxLength: 500 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 50 })),
}, { additionalProperties: false });

function ifMatch(headers: Record<string, string | string[] | undefined>): string {
  const value = headers["if-match"];
  if (typeof value !== "string") throw new AppError(428, "PRECONDITION_REQUIRED", "A current item version is required", "Refresh the item and try again.");
  if (!value || value.length > 200) throw new AppError(422, "VALIDATION_FAILED", "The item version is not valid", "Refresh the item and try again.");
  return value;
}
function commandKey(headers: Record<string, string | string[] | undefined>): string {
  const value = headers["idempotency-key"];
  if (typeof value !== "string" || value.length < 16 || value.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(value)) throw new AppError(422, "VALIDATION_FAILED", "The action key is not valid", "Supply a valid action key and try again.");
  return value;
}

export function registerDecisionRoutes<TLogger extends FastifyBaseLogger>(app: FastifyInstance<RawServerDefault, RawRequestDefaultExpression<RawServerDefault>, RawReplyDefaultExpression<RawServerDefault>, TLogger, TypeBoxTypeProvider>, options: { store: JourneyStore; currentUserProvider: CurrentUserProvider; clock: Clock; idGenerator: IdGenerator }): void {
  const commands = new DecisionCommandService(options.store, options.currentUserProvider, options.clock, options.idGenerator);
  app.get("/api/decisions", { schema: { querystring: ListQuery, response: { 200: DecisionListSchema } } }, async (request) => {
    const userId = await options.currentUserProvider.getCurrentUserId();
    const query = request.query as { quarterId?: string; status?: "DRAFT" | "ACCEPTED" | "SUPERSEDED"; review?: "due"; cursor?: string; limit?: number };
    return options.store.read((state) => projectDecisionList(state, userId, { ...query, due: query.review === "due", limit: query.limit ?? 50, today: localDate(options.clock.now(), state.records.users[userId]!.timeZone) }));
  });
  app.get("/api/decisions/:id", { schema: { params: Params, response: { 200: DecisionDetailSchema } } }, async (request, reply) => {
    const userId = await options.currentUserProvider.getCurrentUserId(); const id = (request.params as { id: string }).id;
    const detail = await options.store.read((state) => { const decision = state.records.decisionRecords[id]; if (!decision || decision.userId !== userId) throw notFound(); return projectDecisionDetail(state, decision); });
    return reply.header("ETag", detail.etag).send(detail);
  });
  app.post("/api/decisions", { schema: { body: CreateBody, response: { 201: DecisionDetailSchema } } }, async (request, reply) => {
    const result = await commands.create(request.body as DecisionDraftInput, commandKey(request.headers)); if (result.replayed) reply.header("Idempotency-Replayed", "true");
    return reply.code(201).header("Location", `/api/decisions/${result.decision.id}`).header("ETag", result.decision.etag).send(result.decision);
  });
  app.put("/api/decisions/:id", { schema: { params: Params, body: UpdateBody, response: { 200: DecisionDetailSchema } } }, async (request, reply) => {
    const detail = await commands.update((request.params as { id: string }).id, request.body as DecisionEditInput, ifMatch(request.headers));
    return reply.header("ETag", detail.etag).send(detail);
  });
  app.post("/api/tasks/:id/decision-draft", { schema: { params: Params, body: Type.Object({}, { additionalProperties: false }), response: { 200: DecisionDetailSchema, 201: DecisionDetailSchema } } }, async (request, reply) => {
    const id = (request.params as { id: string }).id; const route = `/api/tasks/${id}/decision-draft`;
    const result = await commands.createFromTask(id, ifMatch(request.headers), commandKey(request.headers), route); if (result.replayed) reply.header("Idempotency-Replayed", "true");
    return reply.code(result.created ? 201 : 200).header("Location", `/api/decisions/${result.decision.id}`).header("ETag", result.decision.etag).send(result.decision);
  });
  app.post("/api/decisions/:id/accept", { schema: { params: Params, body: AcceptBody, response: { 200: DecisionDetailSchema } } }, async (request, reply) => {
    const id = (request.params as { id: string }).id; const result = await commands.accept(id, request.body as { decisionDate?: string | null }, ifMatch(request.headers), commandKey(request.headers), `/api/decisions/${id}/accept`); if (result.replayed) reply.header("Idempotency-Replayed", "true");
    return reply.header("ETag", result.decision.etag).send(result.decision);
  });
  app.post("/api/decisions/:id/review", { schema: { params: Params, body: ReviewBody, response: { 201: DecisionDetailSchema } } }, async (request, reply) => {
    const id = (request.params as { id: string }).id; const result = await commands.review(id, request.body as DecisionReviewInput, ifMatch(request.headers), commandKey(request.headers), `/api/decisions/${id}/review`); if (result.replayed) reply.header("Idempotency-Replayed", "true");
    return reply.code(201).header("ETag", result.decision.etag).send(result.decision);
  });
}
