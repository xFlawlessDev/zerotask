import { relations } from "drizzle-orm";
import { boolean, date, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { taskPriorityEnum } from "./enums.ts";
import { timestamps } from "./shared.ts";
import { users } from "./identity.ts";

/**
 * Templates are the mechanism that makes a second project cheap: the shape of a
 * delivery (its tasks, their order, their dependencies) is captured once and
 * stamped onto a new project. Dependencies live on the template, not on the
 * project, so editing a template never disturbs running work.
 */
export const templates = pgTable(
  "templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category").notNull().default("general"),
    createdById: text("created_by_id")
      .notNull()
      .references(() => users.id),
    ...timestamps(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    categoryIdx: index("templates_category_idx").on(table.category),
  }),
);

export const templateTasks = pgTable(
  "template_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    durationDays: integer("duration_days").notNull().default(1),
    priority: taskPriorityEnum("priority").notNull().default("medium"),
    estimatedHours: integer("estimated_hours"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => ({
    codeUniq: unique("template_tasks_template_code_key").on(table.templateId, table.code),
  }),
);

export const templateDependencies = pgTable(
  "template_dependencies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    predecessorId: uuid("predecessor_id")
      .notNull()
      .references(() => templateTasks.id, { onDelete: "cascade" }),
    successorId: uuid("successor_id")
      .notNull()
      .references(() => templateTasks.id, { onDelete: "cascade" }),
    type: text("type").notNull().default("fs"),
    lagDays: integer("lag_days").notNull().default(0),
  },
  (table) => ({
    pairUniq: unique("template_dependencies_pair_key").on(
      table.predecessorId,
      table.successorId,
    ),
  }),
);

export const templatesRelations = relations(templates, ({ many, one }) => ({
  tasks: many(templateTasks),
  creator: one(users, { fields: [templates.createdById], references: [users.id] }),
}));

export const templateTasksRelations = relations(templateTasks, ({ one }) => ({
  template: one(templates, { fields: [templateTasks.templateId], references: [templates.id] }),
}));

/**
 * A person's declared availability for one calendar week, used by the resource
 * view to show over-allocation before it becomes a missed date.
 */
export const capacityOffsets = pgTable(
  "capacity_offsets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    weekStart: date("week_start").notNull(),
    availableHours: integer("available_hours").notNull().default(40),
    note: text("note"),
    leave: boolean("leave").notNull().default(false),
    ...timestamps(),
  },
  (table) => ({
    userWeekUniq: unique("capacity_offsets_user_week_key").on(table.userId, table.weekStart),
  }),
);
