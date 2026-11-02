import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "./schema/index.ts";

export async function createTestDatabase() {
  const client = new PGlite("memory://zerotask-test");
  const db = drizzle(client, { schema, casing: "snake_case" });

  await migrate(db, { migrationsFolder: "./drizzle" });

  return { db, client };
}

/**
 * Empties every table without dropping it, so a suite can migrate once and still
 * start each test from nothing. `CASCADE` plus `TRUNCATE` is far cheaper than a
 * fresh database per test, and identity columns are reset so generated codes are
 * predictable.
 */
export async function truncateAll(db: ReturnType<typeof drizzle<typeof schema>>) {
  const rows = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );

  const tables = rows.rows
    .map((row) => row.tablename)
    .filter((name) => !name.startsWith("__drizzle"))
    .map((name) => `"${name}"`);

  if (tables.length === 0) return;
  await db.execute(sql.raw(`truncate table ${tables.join(", ")} restart identity cascade`));
}
