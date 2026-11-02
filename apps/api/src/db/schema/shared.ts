import { timestamp } from "drizzle-orm/pg-core";

/**
 * Created/updated pair used by every mutable table. `$onUpdate` keeps
 * `updated_at` honest without every service remembering to set it.
 */
export function timestamps() {
  return {
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  };
}

/** For tables that can be soft-deleted rather than removed. */
export function softDelete() {
  return {
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  };
}

/**
 * Calendar dates are stored as `date` and handled as `YYYY-MM-DD` strings
 * everywhere. A schedule day is not an instant in time, and treating it as one
 * is how timezone bugs get into a planning tool.
 */
export const DATE_FORMAT = "yyyy-MM-dd";
