import type {
  FastifyBaseLogger,
  FastifyInstance,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import {
  ActivitySchema,
  CarryForwardResponseSchema,
  JourneyEntrySchema,
  JourneyTimelineSchema,
  MilestoneSummarySchema,
  SessionListSchema,
  SessionProjectionSchema,
  TaskDetailSchema,
  TaskListSchema,
} from "../../shared/contracts/index.js";
import type { CurrentUserProvider } from "../adapters/local-current-user-provider.js";
import { AppError } from "../application/app-error.js";
import { projectActivity } from "../application/journey/activity.js";
import { JourneyCommandService, type JourneyEntryInput } from "../application/journey/journey-command-service.js";
import { projectJourneyTimeline } from "../application/journey/journey-timeline.js";
import { projectJourneyEntry } from "../application/journey/journey-projection.js";
import { projectMilestoneSummary } from "../application/journey/milestone-summary.js";
import { SessionCorrectionService } from "../application/journey/session-correction-service.js";
import { projectSession } from "../application/journey/session-projection.js";
import { projectTaskDetail } from "../application/journey/task-detail.js";
import { projectTaskList } from "../application/journey/task-list.js";
import { CarryForwardService } from "../application/tasks/carry-forward-service.js";
import type { Clock } from "../ports/clock.js";
import type { IdGenerator } from "../ports/id-generator.js";
import type { JourneyStore } from "../ports/journey-store.js";

const Id = Type.String({ minLength: 1, maxLength: 128 });
const Params = Type.Object({ id: Id }, { additionalProperties: false });
const MilestoneParams = Type.Object({ id: Id, milestoneId: Id }, { additionalProperties: false });
const NullableId = Type.Union([Id, Type.Null()]);
const EntryCreateBody = Type.Object({
  text: Type.String({ minLength: 1, maxLength: 20_000 }),
  tags: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 64 }), { maxItems: 20 })),
  changedMyMind: Type.Optional(Type.Boolean()),
  relatedTaskId: Type.Optional(NullableId),
  relatedMilestoneId: Type.Optional(NullableId),
  relatedDecisionId: Type.Optional(NullableId),
}, { additionalProperties: false });
const EntryUpdateBody = Type.Object({
  text: Type.String({ minLength: 1, maxLength: 20_000 }),
  tags: Type.Array(Type.String({ minLength: 1, maxLength: 64 }), { maxItems: 20 }),
  changedMyMind: Type.Boolean(),
  relatedTaskId: NullableId,
  relatedMilestoneId: NullableId,
  relatedDecisionId: NullableId,
}, { additionalProperties: false });
const TimelineQuery = Type.Object({
  from: Type.Optional(Type.String()),
  to: Type.Optional(Type.String()),
  taskId: Type.Optional(Id),
  milestoneId: Type.Optional(Id),
  changedMyMind: Type.Optional(Type.Boolean()),
  type: Type.Optional(Type.Union([Type.Literal("THOUGHT"), Type.Literal("SESSION"), Type.Literal("TASK_FINISHED"), Type.Literal("WEEKLY_REFLECTION"), Type.Literal("DECISION_REVIEW")])),
  cursor: Type.Optional(Type.String({ maxLength: 500 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 50 })),
}, { additionalProperties: false });
const ActivityQuery = Type.Object({ from: Type.String(), to: Type.String() }, { additionalProperties: false });
const TaskListQuery = Type.Object({
  quarterId: Type.Optional(Id),
  milestoneId: Type.Optional(Id),
  focusAreaId: Type.Optional(Id),
  plannedFrom: Type.Optional(Type.String()),
  plannedTo: Type.Optional(Type.String()),
  status: Type.Optional(Type.Union([Type.Literal("NOT_STARTED"), Type.Literal("IN_PROGRESS"), Type.Literal("PAUSED"), Type.Literal("FINISHED"), Type.Literal("SKIPPED")])),
  includeRemoved: Type.Optional(Type.Boolean({ default: false })),
  cursor: Type.Optional(Type.String({ maxLength: 500 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 50 })),
}, { additionalProperties: false });
const SessionBody = Type.Object({ startedAt: Type.String(), endedAt: Type.Optional(Type.String()) }, { additionalProperties: false });
const CarryBody = Type.Object({ plannedDate: Type.String(), keyLearning: Type.Optional(Type.String({ minLength: 1, maxLength: 2_000 })) }, { additionalProperties: false });

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

export function registerJourneyRoutes<TLogger extends FastifyBaseLogger>(app: FastifyInstance<RawServerDefault, RawRequestDefaultExpression<RawServerDefault>, RawReplyDefaultExpression<RawServerDefault>, TLogger, TypeBoxTypeProvider>, options: { store: JourneyStore; currentUserProvider: CurrentUserProvider; clock: Clock; idGenerator: IdGenerator }): void {
  const entries = new JourneyCommandService(options.store, options.currentUserProvider, options.clock, options.idGenerator);
  const corrections = new SessionCorrectionService(options.store, options.currentUserProvider, options.clock);
  const carry = new CarryForwardService(options.store, options.currentUserProvider, options.clock, options.idGenerator);

  app.get("/api/journey", { schema: { querystring: TimelineQuery, response: { 200: JourneyTimelineSchema } } }, async (request) => {
    const userId = await options.currentUserProvider.getCurrentUserId();
    const query = request.query as { from?: string; to?: string; taskId?: string; milestoneId?: string; changedMyMind?: boolean; type?: "THOUGHT" | "SESSION" | "TASK_FINISHED" | "WEEKLY_REFLECTION" | "DECISION_REVIEW"; cursor?: string; limit?: number };
    return options.store.read((state) => projectJourneyTimeline(state, userId, { ...query, limit: query.limit ?? 50 }));
  });
  app.get("/api/journey/:id", { schema: { params: Params, response: { 200: JourneyEntrySchema } } }, async (request, reply) => {
    const userId = await options.currentUserProvider.getCurrentUserId();
    const id = (request.params as { id: string }).id;
    const entry = await options.store.read((state) => {
      const target = state.records.journeyEntries[id];
      if (!target || target.userId !== userId) throw new AppError(404, "RESOURCE_NOT_FOUND", "Resource not found", "That local resource does not exist.");
      return projectJourneyEntry(state, target);
    });
    return reply.header("ETag", entry.etag).send(entry);
  });
  app.post("/api/journey", { schema: { body: EntryCreateBody, response: { 201: JourneyEntrySchema } } }, async (request, reply) => {
    const result = await entries.create(request.body as JourneyEntryInput, commandKey(request.headers));
    if (result.replayed) reply.header("Idempotency-Replayed", "true");
    return reply.code(201).header("Location", `/api/journey/${result.entry.id}`).header("ETag", result.entry.etag).send(result.entry);
  });
  app.put("/api/journey/:id", { schema: { params: Params, body: EntryUpdateBody, response: { 200: JourneyEntrySchema } } }, async (request, reply) => {
    const entry = await entries.update((request.params as { id: string }).id, request.body as Parameters<JourneyCommandService["update"]>[1], ifMatch(request.headers));
    return reply.header("ETag", entry.etag).send(entry);
  });
  app.delete("/api/journey/:id", { schema: { params: Params } }, async (request, reply) => {
    await entries.delete((request.params as { id: string }).id, ifMatch(request.headers));
    return reply.code(204).send();
  });
  app.get("/api/activity", { schema: { querystring: ActivityQuery, response: { 200: ActivitySchema } } }, async (request) => {
    const userId = await options.currentUserProvider.getCurrentUserId();
    const query = request.query as { from: string; to: string };
    return options.store.read((state) => projectActivity(state, userId, query.from, query.to));
  });
  app.get("/api/tasks/:id", { schema: { params: Params, response: { 200: TaskDetailSchema } } }, async (request, reply) => {
    const userId = await options.currentUserProvider.getCurrentUserId();
    const generatedAt = options.clock.now().toISOString();
    const id = (request.params as { id: string }).id;
    const detail = await options.store.read((state) => projectTaskDetail(state, userId, id, generatedAt));
    return reply.header("ETag", detail.task.etag).send(detail);
  });
  app.get("/api/tasks", { schema: { querystring: TaskListQuery, response: { 200: TaskListSchema } } }, async (request) => {
    const userId = await options.currentUserProvider.getCurrentUserId();
    const generatedAt = options.clock.now().toISOString();
    const query = request.query as { quarterId?: string; milestoneId?: string; focusAreaId?: string; plannedFrom?: string; plannedTo?: string; status?: "NOT_STARTED" | "IN_PROGRESS" | "PAUSED" | "FINISHED" | "SKIPPED"; includeRemoved?: boolean; cursor?: string; limit?: number };
    return options.store.read((state) => projectTaskList(state, userId, { ...query, limit: query.limit ?? 50 }, generatedAt));
  });
  app.get("/api/tasks/:id/sessions", { schema: { params: Params, response: { 200: SessionListSchema } } }, async (request) => {
    const userId = await options.currentUserProvider.getCurrentUserId();
    const generatedAt = options.clock.now().toISOString();
    const id = (request.params as { id: string }).id;
    return options.store.read((state) => {
      const task = state.records.tasks[id];
      if (!task || state.records.quarters[task.quarterId]?.userId !== userId) {
        throw new AppError(404, "RESOURCE_NOT_FOUND", "Resource not found", "That local resource does not exist.");
      }
      return {
        items: Object.values(state.records.sessions)
          .filter((session) => session.taskId === id)
          .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
          .map((session) => projectSession(session, generatedAt)),
      };
    });
  });
  app.put("/api/sessions/:id", { schema: { params: Params, body: SessionBody, response: { 200: SessionProjectionSchema } } }, async (request, reply) => {
    const session = await corrections.correct((request.params as { id: string }).id, request.body as { startedAt: string; endedAt?: string }, ifMatch(request.headers));
    return reply.header("ETag", session.etag).send(session);
  });
  app.get("/api/quarters/:id/milestones/:milestoneId/summary", { schema: { params: MilestoneParams, response: { 200: MilestoneSummarySchema } } }, async (request) => {
    const userId = await options.currentUserProvider.getCurrentUserId();
    const generatedAt = options.clock.now().toISOString();
    const params = request.params as { id: string; milestoneId: string };
    return options.store.read((state) => {
      const milestone = state.records.milestones[params.milestoneId];
      if (!milestone || milestone.quarterId !== params.id) {
        throw new AppError(404, "RESOURCE_NOT_FOUND", "Resource not found", "That local resource does not exist.");
      }
      return projectMilestoneSummary(state, userId, params.milestoneId, generatedAt);
    });
  });
  app.post("/api/tasks/:id/carry-forward", { schema: { params: Params, body: CarryBody, response: { 201: CarryForwardResponseSchema } } }, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const route = `/api/tasks/${id}/carry-forward`;
    const result = await carry.execute(id, request.body as { plannedDate: string; keyLearning?: string }, ifMatch(request.headers), commandKey(request.headers), route);
    if (result.replayed) reply.header("Idempotency-Replayed", "true");
    return reply.code(201).header("Location", `/api/tasks/${result.response.continuation.id}`).send(result.response);
  });
}
