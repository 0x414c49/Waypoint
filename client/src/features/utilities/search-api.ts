import type { SearchGroupType, SearchResponseContract } from "../../../../shared/contracts/index.js";
import type { ProblemDetails } from "../../../../shared/contracts/problem.js";

export class SearchApiError extends Error {
  constructor(readonly problem: ProblemDetails) {
    super(problem.detail ?? "Search could not be completed.");
  }
}

export async function searchRecords(query: string, options: {
  type?: SearchGroupType;
  quarterId?: string;
  cursor?: string;
  limit?: number;
  signal?: AbortSignal;
} = {}): Promise<SearchResponseContract> {
  const params = new URLSearchParams({ q: query, limit: String(options.limit ?? 25) });
  if (options.type) params.set("type", options.type);
  if (options.quarterId) params.set("quarterId", options.quarterId);
  if (options.cursor) params.set("cursor", options.cursor);
  const response = await fetch(`/api/search?${params}`, {
    headers: { Accept: "application/json" },
    ...(options.signal ? { signal: options.signal } : {}),
  });
  let value: unknown;
  try { value = await response.json(); } catch { value = {}; }
  if (!response.ok) throw new SearchApiError(value as ProblemDetails);
  return value as SearchResponseContract;
}
