import { boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { roleEnum } from "./enums.ts";
import { timestamps } from "./shared.ts";

/**
 * Better Auth owns `users`, `sessions`, `accounts`, and `verifications`. The
 * extra columns on `users` are app fields registered through Better Auth's
 * `additionalFields`, so a session read already carries the caller's role and
 * no second query is needed to authorize a request.
 */

export const departments = pgTable(
  "departments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    color: text("color").notNull().default("#17457F"),
    dailyCapacityHours: integer("daily_capacity_hours").notNull().default(8),
    ...timestamps(),
  },
  (table) => ({
    nameIdx: index("departments_name_idx").on(table.name),
  }),
);

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    name: text("name"),
    image: text("image"),
    role: roleEnum("role").notNull().default("staff"),
    departmentId: uuid("department_id").references(() => departments.id, {
      onDelete: "set null",
    }),
    weeklyHours: integer("weekly_hours").notNull().default(40),
    jobTitle: text("job_title"),
    ...timestamps(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    roleIdx: index("users_role_idx").on(table.role),
    departmentIdx: index("users_department_id_idx").on(table.departmentId),
  }),
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    ...timestamps(),
  },
  (table) => ({
    userIdx: index("sessions_user_id_idx").on(table.userId),
  }),
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    idToken: text("id_token"),
    password: text("password"),
    ...timestamps(),
  },
  (table) => ({
    userIdx: index("accounts_user_id_idx").on(table.userId),
  }),
);

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps(),
});
