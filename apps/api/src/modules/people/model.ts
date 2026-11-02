import { t } from "elysia";
import { ID, appRole, nullable, optionalText, text } from "../../lib/validation.ts";

export const DepartmentModel = {
  create: t.Object({
    code: text(16),
    name: text(80),
    description: nullable(400),
    color: t.Optional(t.String({ pattern: "^#[0-9A-Fa-f]{6}$" })),
    dailyCapacityHours: t.Optional(t.Integer({ minimum: 1, maximum: 24 })),
  }),
  update: t.Object({
    name: t.Optional(text(80)),
    description: nullable(400),
    color: t.Optional(t.String({ pattern: "^#[0-9A-Fa-f]{6}$" })),
    dailyCapacityHours: t.Optional(t.Integer({ minimum: 1, maximum: 24 })),
  }),
};

export const UserModel = {
  listQuery: t.Object({
    limit: t.Optional(t.Integer({ minimum: 1, maximum: 200, default: 50 })),
    offset: t.Optional(t.Integer({ minimum: 0, default: 0 })),
    search: t.Optional(t.String({ maxLength: 120 })),
    departmentId: t.Optional(ID),
    role: t.Optional(appRole),
  }),
  /**
   * Self-service profile. Role and department are deliberately absent: changing
   * your own permissions is an admin action.
   */
  updateSelf: t.Object({
    name: t.Optional(text(80)),
    jobTitle: nullable(80),
    weeklyHours: t.Optional(t.Integer({ minimum: 1, maximum: 80 })),
    image: t.Optional(t.Union([t.String({ maxLength: 2000 }), t.Null()])),
  }),
  updateByAdmin: t.Object({
    name: t.Optional(text(80)),
    jobTitle: nullable(80),
    weeklyHours: t.Optional(t.Integer({ minimum: 1, maximum: 80 })),
    role: t.Optional(appRole),
    departmentId: t.Optional(t.Union([ID, t.Null()])),
  }),
  lookupQuery: t.Object({
    /** Trimmed search over name and email, used by every assignee picker. */
    search: t.Optional(t.String({ maxLength: 120 })),
    limit: t.Optional(t.Integer({ minimum: 1, maximum: 50, default: 20 })),
  }),
};

export { optionalText };


