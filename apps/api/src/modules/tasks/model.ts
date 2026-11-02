import { t } from "elysia";
import {
  ID,
  dateOnly,
  dependencyType,
  nullable,
  optionalDate,
  taskPriority,
  taskStatus,
  text,
} from "../../lib/validation.ts";

export const TaskModel = {
  create: t.Object({
    name: text(200, 2),
    description: nullable(4000),
    status: t.Optional(taskStatus),
    priority: t.Optional(taskPriority),
    durationDays: t.Optional(t.Integer({ minimum: 1, maximum: 3650 })),
    estimatedHours: t.Optional(t.Union([t.Number({ minimum: 0, maximum: 100000 }), t.Null()])),
    plannedStartDate: optionalDate,
    plannedEndDate: optionalDate,
    assignedToId: t.Optional(t.Union([ID, t.Null()])),
    reviewerId: t.Optional(t.Union([ID, t.Null()])),
    departmentId: t.Optional(t.Union([ID, t.Null()])),
    milestoneId: t.Optional(t.Union([ID, t.Null()])),
    labelIds: t.Optional(t.Array(ID, { maxItems: 20 })),
    /** Dependencies declared at creation, so a template import is one request. */
    dependsOn: t.Optional(
      t.Array(
        t.Object({
          taskId: ID,
          type: t.Optional(dependencyType),
          lagDays: t.Optional(t.Integer({ minimum: -365, maximum: 365 })),
        }),
        { maxItems: 50 },
      ),
    ),
  }),

  /**
   * Derived fields (`isCritical`, `totalFloatDays`, `earlyStart`, and friends)
   * are absent on purpose. They belong to the scheduler, and a client that could
   * set them would create a plan that disagrees with its own graph.
   */
  update: t.Object({
    name: t.Optional(text(200, 2)),
    description: nullable(4000),
    status: t.Optional(taskStatus),
    priority: t.Optional(taskPriority),
    durationDays: t.Optional(t.Integer({ minimum: 1, maximum: 3650 })),
    estimatedHours: t.Optional(t.Union([t.Number({ minimum: 0, maximum: 100000 }), t.Null()])),
    progressPercent: t.Optional(t.Integer({ minimum: 0, maximum: 100 })),
    plannedStartDate: optionalDate,
    plannedEndDate: optionalDate,
    actualStartDate: optionalDate,
    actualEndDate: optionalDate,
    assignedToId: t.Optional(t.Union([ID, t.Null()])),
    reviewerId: t.Optional(t.Union([ID, t.Null()])),
    departmentId: t.Optional(t.Union([ID, t.Null()])),
    milestoneId: t.Optional(t.Union([ID, t.Null()])),
    sortOrder: t.Optional(t.Integer({ minimum: 0 })),
  }),

  listQuery: t.Object({
    limit: t.Optional(t.Integer({ minimum: 1, maximum: 500, default: 200 })),
    offset: t.Optional(t.Integer({ minimum: 0, default: 0 })),
    status: t.Optional(t.Union([taskStatus, t.Array(taskStatus)])),
    priority: t.Optional(taskPriority),
    assigneeId: t.Optional(ID),
    departmentId: t.Optional(ID),
    milestoneId: t.Optional(ID),
    labelId: t.Optional(ID),
    search: t.Optional(t.String({ maxLength: 200 })),
    criticalOnly: t.Optional(t.Boolean()),
    order: t.Optional(
      t.Union([
        t.Literal("code"),
        t.Literal("start"),
        t.Literal("due"),
        t.Literal("priority"),
        t.Literal("float"),
      ]),
    ),
  }),

  /** The status a person can move a task to by hand. Completion goes through a
   *  submission, so it is deliberately not in this list. */
  move: t.Object({
    status: t.Union([
      t.Literal("not_started"),
      t.Literal("in_progress"),
      t.Literal("blocked"),
      t.Literal("cancelled"),
    ]),
    note: t.Optional(text(500)),
  }),

  dependency: t.Object({
    predecessorId: ID,
    successorId: ID,
    type: t.Optional(dependencyType),
    lagDays: t.Optional(t.Integer({ minimum: -365, maximum: 365 })),
  }),

  workLog: t.Object({
    logDate: dateOnly,
    hours: t.Number({ minimum: 0.25, maximum: 24 }),
    note: nullable(500),
  }),

  checklistItem: t.Object({
    title: text(200, 2),
  }),

  comment: t.Object({
    body: text(4000, 1),
    parentId: t.Optional(t.Union([ID, t.Null()])),
  }),

  approvalConfig: t.Object({
    requiredApprovals: t.Integer({ minimum: 1, maximum: 10 }),
    approvalMode: t.Optional(t.Union([t.Literal("any"), t.Literal("all")])),
    reviewerIds: t.Array(ID, { minItems: 1, maxItems: 20 }),
  }),

  watcher: t.Object({
    userId: ID,
  }),

  labelAssignment: t.Object({
    labelIds: t.Array(ID, { maxItems: 20 }),
  }),
};








