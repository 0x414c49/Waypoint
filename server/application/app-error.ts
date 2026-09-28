export type Resolution = Readonly<Record<string, unknown>>;

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly title: string,
    message: string,
    readonly extensions: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function notFound(): AppError {
  return new AppError(404, "RESOURCE_NOT_FOUND", "Resource not found", "That local resource does not exist.");
}
