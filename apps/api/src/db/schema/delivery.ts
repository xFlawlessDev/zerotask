import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  approvalModeEnum,
  decisionEnum,
  submissionKindEnum,
  submissionStatusEnum,
} from "./enums.ts";
import { timestamps } from "./shared.ts";
import { projects, tasks } from "./work.ts";
import { users } from "./identity.ts";

/**
 * A submission is the only path from "working on it" to "done": it carries what
 * was done, what evidence exists, and who signed off. Approval decisions are
 * rows rather than a single column because some tasks require several approvers.
 */
export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    submittedById: text("submitted_by_id")
      .notNull()
      .references(() => users.id),
    kind: submissionKindEnum("kind").notNull().default("completion"),
    status: submissionStatusEnum("status").notNull().default("pending_review"),
    note: text("note"),
    progressPercent: integer("progress_percent"),
    hoursSpent: numeric("hours_spent", { precision: 8, scale: 2 }),
    /**
     * Approver requirements are copied onto the submission when it is created.
     * Editing the task's approval config mid-review must not change who is
     * allowed to decide the submission already in flight.
     */
    requiredApprovals: integer("required_approvals").notNull().default(1),
    approvalMode: approvalModeEnum("approval_mode").notNull().default("any"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    taskIdx: index("submissions_task_id_idx").on(table.taskId),
    projectIdx: index("submissions_project_id_idx").on(table.projectId),
    statusIdx: index("submissions_status_idx").on(table.status),
    submitterIdx: index("submissions_submitted_by_id_idx").on(table.submittedById),
    taskStatusIdx: index("submissions_task_status_idx").on(table.taskId, table.status),
  }),
);

export const submissionReviewers = pgTable(
  "submission_reviewers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => ({
    reviewerUniq: unique("submission_reviewers_submission_user_key").on(
      table.submissionId,
      table.userId,
    ),
  }),
);

export const submissionDecisions = pgTable(
  "submission_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    reviewerId: text("reviewer_id")
      .notNull()
      .references(() => users.id),
    decision: decisionEnum("decision").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    reviewerUniq: unique("submission_decisions_submission_reviewer_key").on(
      table.submissionId,
      table.reviewerId,
    ),
  }),
);

/**
 * Task approval configuration lives on the task so an admin can set "two of
 * three leads must sign off" once, rather than per submission.
 */
export const taskApprovalConfig = pgTable("task_approval_config", {
  taskId: uuid("task_id")
    .primaryKey()
    .references(() => tasks.id, { onDelete: "cascade" }),
  requiredApprovals: integer("required_approvals").notNull().default(1),
  approvalMode: approvalModeEnum("approval_mode").notNull().default("any"),
  ...timestamps(),
});

export const taskApprovers = pgTable(
  "task_approvers",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => ({
    pk: unique("task_approvers_task_user_key").on(table.taskId, table.userId),
  }),
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    parentId: uuid("parent_id"),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    ...timestamps(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    taskIdx: index("comments_task_id_idx").on(table.taskId),
    authorIdx: index("comments_author_id_idx").on(table.authorId),
    createdIdx: index("comments_created_at_idx").on(table.createdAt),
  }),
);

export const workLogs = pgTable(
  "work_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    logDate: date("log_date").notNull(),
    hours: numeric("hours", { precision: 5, scale: 2 }).notNull(),
    note: text("note"),
    ...timestamps(),
  },
  (table) => ({
    taskIdx: index("work_logs_task_id_idx").on(table.taskId),
    userDateIdx: index("work_logs_user_date_idx").on(table.userId, table.logDate),
  }),
);

export const checklistItems = pgTable(
  "checklist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    done: boolean("done").notNull().default(false),
    doneById: text("done_by_id").references(() => users.id, { onDelete: "set null" }),
    doneAt: timestamp("done_at", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    taskIdx: index("checklist_items_task_id_idx").on(table.taskId),
  }),
);

export const watchers = pgTable(
  "watchers",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: unique("watchers_task_user_key").on(table.taskId, table.userId),
  }),
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("other"),
    storageKey: text("storage_key"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    version: text("version").notNull().default("1.0"),
    note: text("note"),
    uploadedById: text("uploaded_by_id")
      .notNull()
      .references(() => users.id),
    ...timestamps(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    projectIdx: index("documents_project_id_idx").on(table.projectId),
    taskIdx: index("documents_task_id_idx").on(table.taskId),
    codeIdx: index("documents_code_idx").on(table.code),
    deletedIdx: index("documents_deleted_at_idx").on(table.deletedAt),
  }),
);

export const submissionDocuments = pgTable(
  "submission_documents",
  {
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: unique("submission_documents_pair_key").on(table.submissionId, table.documentId),
  }),
);

export const submissionsRelations = relations(submissions, ({ one, many }) => ({
  task: one(tasks, { fields: [submissions.taskId], references: [tasks.id] }),
  project: one(projects, { fields: [submissions.projectId], references: [projects.id] }),
  submitter: one(users, { fields: [submissions.submittedById], references: [users.id] }),
  reviewers: many(submissionReviewers),
  decisions: many(submissionDecisions),
  documents: many(submissionDocuments),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  task: one(tasks, { fields: [comments.taskId], references: [tasks.id] }),
  author: one(users, { fields: [comments.authorId], references: [users.id] }),
}));

export const workLogsRelations = relations(workLogs, ({ one }) => ({
  task: one(tasks, { fields: [workLogs.taskId], references: [tasks.id] }),
  user: one(users, { fields: [workLogs.userId], references: [users.id] }),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  project: one(projects, { fields: [documents.projectId], references: [projects.id] }),
  task: one(tasks, { fields: [documents.taskId], references: [tasks.id] }),
  uploader: one(users, { fields: [documents.uploadedById], references: [users.id] }),
  links: many(submissionDocuments),
}));
