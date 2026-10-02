import type { FastifyBaseLogger, FastifyInstance, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerDefault } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { SearchResponseSchema } from "../../shared/contracts/index.js";
import type { CurrentUserProvider } from "../adapters/local-current-user-provider.js";
import { searchRecords } from "../application/search/search.js";
import type { JourneyStore } from "../ports/journey-store.js";

const SearchQuerySchema = Type.Object({
  q: Type.String({ minLength: 1, maxLength: 200 }),
  type: Type.Optional(Type.Union([Type.Literal("PLAN"), Type.Literal("JOURNEY"), Type.Literal("DECISION")])),
  quarterId: Type.Optional(Type.String({ minLength: 1, maxLength: 128, pattern: "^[a-z0-9][a-z0-9._-]*$" })),
  cursor: Type.Optional(Type.String({ maxLength: 500 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 25 })),
}, { additionalProperties: false });

export function registerSearchRoutes<TLogger extends FastifyBaseLogger>(
  app: FastifyInstance<RawServerDefault, RawRequestDefaultExpression<RawServerDefault>, RawReplyDefaultExpression<RawServerDefault>, TLogger, TypeBoxTypeProvider>,
  options: { store: JourneyStore; currentUserProvider: CurrentUserProvider },
): void {
  app.get("/api/search", { schema: { querystring: SearchQuerySchema, response: { 200: SearchResponseSchema } } }, async (request) => {
    const userId = await options.currentUserProvider.getCurrentUserId();
    const query = request.query as { q: string; type?: "PLAN" | "JOURNEY" | "DECISION"; quarterId?: string; cursor?: string; limit?: number };
    const input = {
      query: query.q,
      ...(query.type ? { type: query.type } : {}),
      ...(query.quarterId ? { quarterId: query.quarterId } : {}),
      ...(query.cursor ? { cursor: query.cursor } : {}),
      limit: query.limit ?? 25,
    };
    return options.store.search
      ? options.store.search(userId, input)
      : options.store.read((state) => searchRecords(state, userId, input));
  });
}
