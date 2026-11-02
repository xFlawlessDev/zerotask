import { Elysia } from "elysia";
import { AppError } from "./errors.ts";

/**
 * Turns every failure into one response shape: `{ code, message }`. A client
 * therefore has exactly one error branch to write, and a validation failure
 * reads like a business failure instead of leaking TypeBox's internals.
 */
export const errorHandler = new Elysia({ name: "error-handler" }).onError(
  { as: "global" },
  ({ code, error, set }) => {
    if (error instanceof AppError) {
      set.status = error.status;
      return { code: error.code, message: error.message, details: error.details };
    }

    if (code === "VALIDATION") {
      set.status = 422;
      const detail = error as {
        property?: string;
        message?: string;
        errors?: { path?: string; message?: string }[];
      };

      const first = detail.errors?.[0];
      const field = (first?.path ?? detail.property ?? "").replace(/^\//, "");
      const reason = first?.message ?? detail.message ?? "Invalid value";

      return {
        code: "VALIDATION",
        message: field ? `${field}: ${reason}` : reason,
        details: { field },
      };
    }

    if (code === "NOT_FOUND") {
      set.status = 404;
      return { code: "NOT_FOUND", message: "That endpoint does not exist" };
    }

    if (code === "PARSE") {
      set.status = 400;
      return { code: "MALFORMED_BODY", message: "The request body is not valid JSON" };
    }

    // Anything left is a bug. Log it with enough context to find it, and do not
    // hand the internal message to the client.
    console.error(`[api] ${code}`, error);
    set.status = 500;
    return { code: "INTERNAL", message: "Something went wrong on our side" };
  },
);
