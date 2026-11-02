/**
 * One error type for anything a caller can act on. Routes throw these; the
 * error handler turns them into `{ code, message }` with the right status, so no
 * route has to build an HTTP response by hand.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const errors = {
  unauthorized: (message = "Sign in to continue") =>
    new AppError(401, "UNAUTHORIZED", message),

  forbidden: (message = "You do not have access to this resource") =>
    new AppError(403, "FORBIDDEN", message),

  notFound: (what: string) => new AppError(404, "NOT_FOUND", `${what} not found`),

  conflict: (message: string) => new AppError(409, "CONFLICT", message),

  invalid: (message: string, details?: unknown) =>
    new AppError(422, "INVALID", message, details),

  /**
   * Business rules that the request shape cannot express: a cycle in the
   * dependency graph, a submission that is already decided, an approval the
   * caller is not eligible to give.
   */
  rule: (code: string, message: string) => new AppError(409, code, message),
} as const;
