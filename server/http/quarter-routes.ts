import type { FastifyBaseLogger, FastifyInstance, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerDefault } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { QuarterDetailSchema, QuarterListSchema } from "../../shared/contracts/index.js";
import type { CurrentUserProvider } from "../adapters/local-current-user-provider.js";
import { projectQuarterDetail, projectQuarterList } from "../application/quarters/quarter-projection.js";
import type { Clock } from "../ports/clock.js";
import type { JourneyStore } from "../ports/journey-store.js";

const Params = Type.Object({ id: Type.String({ minLength: 1, maxLength: 128, pattern: "^[a-z0-9][a-z0-9._-]*$" }) }, { additionalProperties: false });

export function registerQuarterRoutes<TLogger extends FastifyBaseLogger>(app: FastifyInstance<RawServerDefault, RawRequestDefaultExpression<RawServerDefault>, RawReplyDefaultExpression<RawServerDefault>, TLogger, TypeBoxTypeProvider>, options: { store: JourneyStore; currentUserProvider: CurrentUserProvider; clock: Clock }): void {
  app.get("/api/quarters", { schema: { response: { 200: QuarterListSchema } } }, async () => {
    const userId = await options.currentUserProvider.getCurrentUserId();
    return options.store.read((state) => projectQuarterList(state, userId, options.clock.now()));
  });
  app.get("/api/quarters/:id", { schema: { params: Params, response: { 200: QuarterDetailSchema } } }, async (request, reply) => {
    const userId = await options.currentUserProvider.getCurrentUserId();
    const detail = await options.store.read((state) => projectQuarterDetail(state, userId, (request.params as { id: string }).id, options.clock.now()));
    return reply.header("ETag", detail.etag).send(detail);
  });
}
