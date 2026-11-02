import { t } from "elysia";
import {
  ID,
  dateOnly,
  milestoneStatus,
  nullable,
  optionalDate,
  projectRole,
  projectStatus,
  text,
} from "../../lib/validation.ts";

export const ProjectModel = {
  create: t.Object({
    name: text(120, 2),
    description: nullable(2000),
    ownerId: t.Optional(ID),
    status: t.Optional(projectStatus),
    targetLaunchDate: optionalDate,
    kickoffDate: optionalDate,
    /** When set, the launch date is derived from the kickoff plus this many days. */
    leadTimeDays: t.Optional(t.Union([t.Integer({ minimum: 1, maximum: 1095 }), t.Null()])),
  }),

  /**
   * `targetLaunchDate` and `leadTimeDays` are mutually dependent, so the pairing
   * is validated in the service rather than restated in three route schemas.
   */
  update: t.Object({
    name: t.Optional(text(120, 2)),
    description: nullable(2000),
    status: t.Optional(projectStatus),
    targetLaunchDate: optionalDate,
    kickoffDate: optionalDate,
    leadTimeDays: t.Optional(t.Union([t.Integer({ minimum: 1, maximum: 1095 }), t.Null()])),
  }),

  listQuery: t.Object({
    limit: t.Optional(t.Integer({ minimum: 1, maximum: 200, default: 50 })),
    offset: t.Optional(t.Integer({ minimum: 0, default: 0 })),
    status: t.Optional(projectStatus),
    search: t.Optional(t.String({ maxLength: 120 })),
    /** `mine` restricts to projects the caller belongs to. */
    scope: t.Optional(t.Union([t.Literal("mine"), t.Literal("all"), t.Literal("archived")])),
    order: t.Optional(t.Union([t.Literal("recent"), t.Literal("name"), t.Literal("launch")])),
  }),

  addMember: t.Object({
    userId: ID,
    role: t.Optional(projectRole),
  }),

  updateMember: t.Object({
    role: projectRole,
  }),

  milestone: t.Object({
    name: text(120, 2),
    description: nullable(800),
    targetDate: optionalDate,
  }),

  milestoneUpdate: t.Object({
    name: t.Optional(text(120, 2)),
    description: nullable(800),
    targetDate: optionalDate,
    status: t.Optional(milestoneStatus),
  }),

  label: t.Object({
    name: text(40, 1),
    color: t.Optional(t.String({ pattern: "^#[0-9A-Fa-f]{6}$" })),
  }),

  revision: t.Object({
    title: text(120, 2),
    reason: text(1000, 3),
    source: t.Optional(t.Union([t.Literal("internal"), t.Literal("client"), t.Literal("supplier")])),
    /** Only the tasks being moved. Omitted tasks keep their current dates. */
    changes: t.Array(
      t.Object({
        taskId: ID,
        plannedStartDate: dateOnly,
        durationDays: t.Optional(t.Integer({ minimum: 1, maximum: 3650 })),
        note: t.Optional(text(400)),
      }),
      { minItems: 1, maxItems: 500 },
    ),
  }),

  decision: t.Object({
    note: t.Optional(text(1000)),
  }),
};









