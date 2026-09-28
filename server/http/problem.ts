import type { ProblemDetails } from "../../shared/contracts/index.js";

export function problem(
  traceId: string,
  path: string,
  code: string,
  title: string,
  status: number,
  detail: string,
  extensions: Readonly<Record<string, unknown>> = {},
): ProblemDetails & Record<string, unknown> {
  return {
    type: `urn:journey-tracker:problem:${code.toLowerCase().replaceAll("_", "-")}`,
    title,
    status,
    code,
    detail,
    instance: path,
    traceId,
    ...extensions,
  };
}
