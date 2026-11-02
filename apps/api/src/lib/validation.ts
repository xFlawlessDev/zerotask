import { t } from "elysia";
import { Type } from "@sinclair/typebox";
import {
  DEPENDENCY_TYPES,
  DOCUMENT_KINDS,
  MILESTONE_STATUSES,
  PROJECT_ROLES,
  PROJECT_STATUSES,
  ROLES,
  SCHEDULE_CHANGE_SOURCES,
  SUBMISSION_KINDS,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from "@zerotask/domain";

/**
 * Shared validation pieces. Listing the closed sets once here means a new status
 * value is added in one place and every route that accepts it picks it up.
 */

/**
 * An identifier in a path or body. Deliberately not `format: "uuid"`: person ids
 * come from Better Auth and are opaque strings, and a shape check here would
 * reject real users while adding nothing, since an id that matches no row already
 * produces a 404.
 */
export const ID = t.String({ minLength: 1, maxLength: 64 });

export const idParams = t.Object({ id: ID });

export const projectParams = t.Object({ projectId: ID });

export const taskInProjectParams = t.Object({
  projectId: ID,
  taskId: ID,
});

export const personId = ID;

/** `YYYY-MM-DD`. A duration or a schedule date, never a timestamp. */
export const dateOnly = t.String({
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
  description: "Calendar date in YYYY-MM-DD form",
});

export const optionalDate = t.Optional(t.Union([dateOnly, t.Null()]));

export const taskStatus = t.Union(TASK_STATUSES.map((value) => t.Literal(value)));
export const taskPriority = t.Union(TASK_PRIORITIES.map((value) => t.Literal(value)));
export const projectStatus = t.Union(PROJECT_STATUSES.map((value) => t.Literal(value)));
export const projectRole = t.Union(PROJECT_ROLES.map((value) => t.Literal(value)));
export const appRole = t.Union(ROLES.map((value) => t.Literal(value)));
export const dependencyType = t.Union(DEPENDENCY_TYPES.map((value) => t.Literal(value)));
export const submissionKind = t.Union(SUBMISSION_KINDS.map((value) => t.Literal(value)));
export const milestoneStatus = t.Union(MILESTONE_STATUSES.map((value) => t.Literal(value)));
export const documentKind = t.Union(DOCUMENT_KINDS.map((value) => t.Literal(value)));
export const changeSource = t.Union(SCHEDULE_CHANGE_SOURCES.map((value) => t.Literal(value)));

export const pagination = t.Object({
  limit: t.Optional(t.Integer({ minimum: 1, maximum: 200, default: 50 })),
  offset: t.Optional(t.Integer({ minimum: 0, default: 0 })),
});

export const okResponse = t.Object({ ok: t.Literal(true) });

/** Trimmed, non-empty text with a maximum, which catches pasted essays early. */
export function text(maxLength: number, minLength = 1) {
  return t.String({ minLength, maxLength, transform: (value: string) => value.trim() });
}

/**
 * A field the client may clear by sending null. Written as a helper because a
 * union of "text" and "null" appears on almost every update schema, and spelling
 * it inline is where a schema goes wrong quietly.
 */
export function nullable(maxLength: number, minLength = 1) {
  return t.Optional(
    t.Union([t.String({ minLength, maxLength }), t.Null()]),
  );
}

export const optionalText = text;

export { Type };
