import type {
  FastifyBaseLogger,
  FastifyInstance,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type, type TSchema } from "@sinclair/typebox";
import { DashboardSchema, TaskActionResponseSchema } from "../../shared/contracts/index.js";
import type { CurrentUserProvider } from "../adapters/local-current-user-provider.js";
import { AppError } from "../application/app-error.js";
import { projectDashboard } from "../application/dashboard/dashboard.js";
import {
  TaskCommandService,
  type TaskAction,
  type TaskCommandBody,
} from "../application/tasks/task-command-service.js";
import type { Clock } from "../ports/clock.js";
import type { IdGenerator } from "../ports/id-generator.js";
import type { JourneyStore } from "../ports/journey-store.js";

const TaskParamsSchema = Type.Object(
  { id: Type.String({ minLength: 1, maxLength: 128 }) },
  { additionalProperties: false },
);
const ActiveResolutionSchema = Type.Object(
  {
    kind: Type.Literal("PAUSE_AND_SWITCH"),
    activeSessionId: Type.String({ minLength: 1, maxLength: 128 }),
    activeTaskEtag: Type.String({ minLength: 1, maxLength: 200 }),
  },
  { additionalProperties: false },
);
const StartBodySchema = Type.Object(
  {
    intentionMinutes: Type.Optional(Type.Literal(10)),
    activeSessionResolution: Type.Optional(ActiveResolutionSchema),
  },
  { additionalProperties: false },
);
const ResumeBodySchema = Type.Object(
  { activeSessionResolution: Type.Optional(ActiveResolutionSchema) },
  { additionalProperties: false },
);
const EmptyBodySchema = Type.Object({}, { additionalProperties: false });
const FinishBodySchema = Type.Object(
  {
    outcome: Type.Union([
      Type.Literal("ACHIEVED"),
      Type.Literal("PARTIAL"),
      Type.Literal("NOT_ACHIEVED"),
    ]),
    keyLearning: Type.Optional(Type.String({ minLength: 1, maxLength: 2_000 })),
    reflection: Type.Optional(Type.String({ minLength: 1, maxLength: 20_000 })),
  },
  { additionalProperties: false },
);
const ReopenBodySchema = Type.Object(
  { closureEventId: Type.String({ minLength: 1, maxLength: 128 }) },
  { additionalProperties: false },
);

function commandHeaders(headers: Record<string, string | string[] | undefined>) {
  const ifMatch = headers["if-match"];
  if (typeof ifMatch !== "string") {
    throw new AppError(428, "PRECONDITION_REQUIRED", "A current item version is required", "Refresh the item and try again.");
  }
  if (ifMatch.length < 1 || ifMatch.length > 200) {
    throw new AppError(422, "VALIDATION_FAILED", "The request is not valid", "Supply a valid item version and try again.");
  }
  const idempotencyKey = headers["idempotency-key"];
  if (typeof idempotencyKey !== "string" || idempotencyKey.length < 16 || idempotencyKey.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)) {
    throw new AppError(422, "VALIDATION_FAILED", "The request is not valid", "Supply a valid action key and try again.", {
      fieldErrors: [{ path: "/headers/Idempotency-Key", code: "INVALID_VALUE", message: "Use 16–128 letters, numbers, dots, underscores, colons, or hyphens." }],
    });
  }
  return { ifMatch, idempotencyKey };
}

export function registerTodayRoutes<TLogger extends FastifyBaseLogger>(
  app: FastifyInstance<
    RawServerDefault,
    RawRequestDefaultExpression<RawServerDefault>,
    RawReplyDefaultExpression<RawServerDefault>,
    TLogger,
    TypeBoxTypeProvider
  >,
  options: {
    store: JourneyStore;
    currentUserProvider: CurrentUserProvider;
    clock: Clock;
    idGenerator: IdGenerator;
  },
): void {
  const commands = new TaskCommandService(options.store, options.currentUserProvider, options.clock, options.idGenerator);
  app.get(
    "/api/dashboard",
    { schema: { response: { 200: DashboardSchema } } },
    async () => {
      const userId = await options.currentUserProvider.getCurrentUserId();
      const now = options.clock.now();
      return options.store.read((state) => projectDashboard(state, userId, now));
    },
  );

  const registerAction = (action: TaskAction, bodySchema: TSchema) => {
    app.post(
      `/api/tasks/:id/${action}`,
      { schema: { params: TaskParamsSchema, body: bodySchema, response: { 200: TaskActionResponseSchema } } },
      async (request, reply) => {
        const headers = commandHeaders(request.headers);
        const { id } = request.params as { id: string };
        const result = await commands.execute({
          action,
          taskId: id,
          body: request.body as TaskCommandBody,
          ...headers,
          method: "POST",
          route: `/api/tasks/${id}/${action}`,
        });
        if (result.replayed) reply.header("Idempotency-Replayed", "true");
        return result.response;
      },
    );
  };
  registerAction("start", StartBodySchema);
  registerAction("pause", EmptyBodySchema);
  registerAction("resume", ResumeBodySchema);
  registerAction("finish", FinishBodySchema);
  registerAction("reopen", ReopenBodySchema);
}
