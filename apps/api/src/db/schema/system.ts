import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { emailStatusEnum, favoriteKindEnum, notificationKindEnum } from "./enums.ts";
import { timestamps } from "./shared.ts";
import { users } from "./identity.ts";
import { projects } from "./work.ts";

/**
 * The feed a person reads when they open the app. Written by the API after a
 * state change, never by the client.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: notificationKindEnum("kind").notNull().default("system"),
    title: text("title").notNull(),
    body: text("body"),
    /** In-app route the notification opens, as a path the web app understands. */
    href: text("href"),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userReadIdx: index("notifications_user_read_idx").on(table.userId, table.readAt),
    createdIdx: index("notifications_created_at_idx").on(table.createdAt),
  }),
);

/**
 * Who did what, for the project activity feed and for reconstructing how a
 * schedule or a task arrived at its current state.
 */
export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    summary: text("summary").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectCreatedIdx: index("activity_events_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
    entityIdx: index("activity_events_entity_idx").on(table.entityType, table.entityId),
    actorIdx: index("activity_events_actor_id_idx").on(table.actorId),
  }),
);

export const favorites = pgTable(
  "favorites",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: favoriteKindEnum("kind").notNull(),
    entityId: uuid("entity_id").notNull(),
    label: text("label").notNull(),
    href: text("href").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: unique("favorites_user_entity_key").on(table.userId, table.kind, table.entityId),
  }),
);

/**
 * Email is queued rather than sent inline: the request that triggers it must not
 * wait on a mail server, and a failed send must be retryable.
 */
export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    bodyText: text("body_text").notNull(),
    bodyHtml: text("body_html"),
    status: emailStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    /** Unique per logical event so a retried handler cannot send twice. */
    dedupeKey: text("dedupe_key").unique(),
    sendAfter: timestamp("send_after", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusSendAfterIdx: index("email_outbox_status_send_after_idx").on(
      table.status,
      table.sendAfter,
    ),
  }),
);

export const notificationPreferences = pgTable("notification_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  emailEnabled: boolean("email_enabled").notNull().default(true),
  assignmentEmail: boolean("assignment_email").notNull().default(true),
  reviewEmail: boolean("review_email").notNull().default(true),
  scheduleEmail: boolean("schedule_email").notNull().default(true),
  ...timestamps(),
});

/**
 * Weekly capacity per person per project. Workload views read this instead of
 * assuming eight hours a day, because real teams allocate partial people.
 */
export const allocations = pgTable(
  "allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    weekStart: timestamp("week_start", { withTimezone: true }).notNull(),
    hours: numeric("hours", { precision: 6, scale: 2 }).notNull().default("0"),
    ...timestamps(),
  },
  (table) => ({
    weekUniq: unique("allocations_project_user_week_key").on(
      table.projectId,
      table.userId,
      table.weekStart,
    ),
    userIdx: index("allocations_user_id_idx").on(table.userId),
    weekIdx: index("allocations_week_start_idx").on(table.weekStart),
  }),
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
  project: one(projects, { fields: [notifications.projectId], references: [projects.id] }),
}));

export const activityEventsRelations = relations(activityEvents, ({ one }) => ({
  project: one(projects, { fields: [activityEvents.projectId], references: [projects.id] }),
  actor: one(users, { fields: [activityEvents.actorId], references: [users.id] }),
}));
