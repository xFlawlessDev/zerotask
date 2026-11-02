import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  dependencyTypeEnum,
  milestoneStatusEnum,
  projectRoleEnum,
  projectStatusEnum,
  revisionStatusEnum,
  changeSourceEnum,
  targetDateModeEnum,
  taskPriorityEnum,
  taskStatusEnum,
} from "./enums.ts";
import { timestamps } from "./shared.ts";
import { departments, users } from "./identity.ts";

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    status: projectStatusEnum("status").notNull().default("draft"),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id),
    createdById: text("created_by_id")
      .notNull()
      .references(() => users.id),
    targetLaunchDate: date("target_launch_date"),
    launchDateFormat: targetDateModeEnum("launch_date_format").notNull().default("manual"),
    kickoffDate: date("kickoff_date"),
    leadTimeDays: integer("lead_time_days"),
    /**
     * The end date of the last schedule run, kept so variance against the target
     * can be shown without recomputing. Written only by the scheduler.
     */
    baselinedEndDate: date("baselined_end_date"),
    lastScheduledAt: timestamp("last_scheduled_at", { withTimezone: true }),
    ...timestamps(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    statusIdx: index("projects_status_idx").on(table.status),
    ownerIdx: index("projects_owner_id_idx").on(table.ownerId),
    deletedIdx: index("projects_deleted_at_idx").on(table.deletedAt),
  }),
);

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: projectRoleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.projectId, table.userId] }),
    userIdx: index("project_members_user_id_idx").on(table.userId),
  }),
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    status: taskStatusEnum("status").notNull().default("not_started"),
    priority: taskPriorityEnum("priority").notNull().default("medium"),
    durationDays: integer("duration_days").notNull().default(1),
    estimatedHours: numeric("estimated_hours", { precision: 8, scale: 2 }),
    progressPercent: integer("progress_percent").notNull().default(0),
    plannedStartDate: date("planned_start_date"),
    plannedEndDate: date("planned_end_date"),
    actualStartDate: date("actual_start_date"),
    actualEndDate: date("actual_end_date"),
    /**
     * CPM outputs. Derived fields: written by the scheduler, never by a client,
     * because a hand-set float value would silently disagree with the graph.
     */
    earlyStart: date("early_start"),
    earlyFinish: date("early_finish"),
    lateStart: date("late_start"),
    lateFinish: date("late_finish"),
    totalFloatDays: integer("total_float_days"),
    isCritical: boolean("is_critical").notNull().default(false),
    assignedToId: text("assigned_to_id").references(() => users.id, { onDelete: "set null" }),
    reviewerId: text("reviewer_id").references(() => users.id, { onDelete: "set null" }),
    departmentId: uuid("department_id").references(() => departments.id, {
      onDelete: "set null",
    }),
    milestoneId: uuid("milestone_id").references(() => milestones.id, { onDelete: "set null" }),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    projectCodeUniq: unique("tasks_project_code_key").on(table.projectId, table.code),
    projectIdx: index("tasks_project_id_idx").on(table.projectId),
    assigneeIdx: index("tasks_assigned_to_id_idx").on(table.assignedToId),
    statusIdx: index("tasks_status_idx").on(table.status),
    projectStatusIdx: index("tasks_project_status_idx").on(table.projectId, table.status),
    assigneeStatusIdx: index("tasks_assignee_status_idx").on(table.assignedToId, table.status),
    milestoneIdx: index("tasks_milestone_id_idx").on(table.milestoneId),
    deletedIdx: index("tasks_deleted_at_idx").on(table.deletedAt),
  }),
);

export const taskDependencies = pgTable(
  "task_dependencies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    predecessorId: uuid("predecessor_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    successorId: uuid("successor_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    type: dependencyTypeEnum("type").notNull().default("fs"),
    lagDays: integer("lag_days").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pairUniq: unique("task_dependencies_pair_key").on(table.predecessorId, table.successorId),
    projectIdx: index("task_dependencies_project_id_idx").on(table.projectId),
    predecessorIdx: index("task_dependencies_predecessor_id_idx").on(table.predecessorId),
    successorIdx: index("task_dependencies_successor_id_idx").on(table.successorId),
  }),
);

export const milestones = pgTable(
  "milestones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    targetDate: date("target_date"),
    status: milestoneStatusEnum("status").notNull().default("not_started"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps(),
  },
  (table) => ({
    projectIdx: index("milestones_project_id_idx").on(table.projectId),
    dateIdx: index("milestones_target_date_idx").on(table.targetDate),
  }),
);

export const labels = pgTable(
  "labels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#545B63"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    nameUniq: unique("labels_project_name_key").on(table.projectId, table.name),
  }),
);

export const taskLabels = pgTable(
  "task_labels",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.taskId, table.labelId] }),
  }),
);

/**
 * A schedule revision is a proposed move of dates, held for review before it
 * becomes the plan. Items snapshot old and new dates so the diff survives later
 * task edits.
 */
export const scheduleRevisions = pgTable(
  "schedule_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    revisionNo: integer("revision_no").notNull(),
    title: text("title").notNull(),
    reason: text("reason").notNull(),
    source: changeSourceEnum("source").notNull().default("internal"),
    status: revisionStatusEnum("status").notNull().default("draft"),
    requestedById: text("requested_by_id")
      .notNull()
      .references(() => users.id),
    decidedById: text("decided_by_id").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    /**
     * The baseline and proposal are captured when the revision is created, not
     * recomputed at approval time, so a reviewer always sees the delta they
     * were shown when they decided.
     */
    baselineEndDate: date("baseline_end_date"),
    proposedEndDate: date("proposed_end_date"),
    deltaDays: integer("delta_days"),
    criticalPathChanged: boolean("critical_path_changed").notNull().default(false),
    ...timestamps(),
  },
  (table) => ({
    revisionNoUniq: unique("schedule_revisions_project_no_key").on(table.projectId, table.revisionNo),
    projectIdx: index("schedule_revisions_project_id_idx").on(table.projectId),
    statusIdx: index("schedule_revisions_status_idx").on(table.status),
  }),
);

export const scheduleRevisionItems = pgTable(
  "schedule_revision_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => scheduleRevisions.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    oldStartDate: date("old_start_date"),
    oldEndDate: date("old_end_date"),
    newStartDate: date("new_start_date"),
    newEndDate: date("new_end_date"),
    oldDurationDays: integer("old_duration_days"),
    newDurationDays: integer("new_duration_days"),
    shiftDays: integer("shift_days").notNull().default(0),
    note: text("note"),
  },
  (table) => ({
    revisionTaskUniq: unique("schedule_revision_items_revision_task_key").on(
      table.revisionId,
      table.taskId,
    ),
  }),
);

export const projectsRelations = relations(projects, ({ one, many }) => ({
  owner: one(users, { fields: [projects.ownerId], references: [users.id] }),
  members: many(projectMembers),
  tasks: many(tasks),
  milestones: many(milestones),
  labels: many(labels),
  revisions: many(scheduleRevisions),
}));

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, { fields: [projectMembers.projectId], references: [projects.id] }),
  user: one(users, { fields: [projectMembers.userId], references: [users.id] }),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  assignee: one(users, { fields: [tasks.assignedToId], references: [users.id] }),
  reviewer: one(users, { fields: [tasks.reviewerId], references: [users.id] }),
  department: one(departments, { fields: [tasks.departmentId], references: [departments.id] }),
  milestone: one(milestones, { fields: [tasks.milestoneId], references: [milestones.id] }),
  taskLabels: many(taskLabels),
  subtasks: many(tasks),
}));

export const milestonesRelations = relations(milestones, ({ one, many }) => ({
  project: one(projects, { fields: [milestones.projectId], references: [projects.id] }),
  tasks: many(tasks),
}));

export const taskLabelsRelations = relations(taskLabels, ({ one }) => ({
  task: one(tasks, { fields: [taskLabels.taskId], references: [tasks.id] }),
  label: one(labels, { fields: [taskLabels.labelId], references: [labels.id] }),
}));
