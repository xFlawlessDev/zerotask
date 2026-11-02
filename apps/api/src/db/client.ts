import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import postgres from "postgres";
import { config } from "../config.ts";
import * as schema from "./schema/index.ts";

/** Migrations live beside the API package, whatever directory the process started in. */
const MIGRATIONS = fileURLToPath(new URL("../../drizzle", import.meta.url));

/**
 * PGlite creates its data directory but not the parents, and the default lives
 * under `.data`, which does not exist on a fresh checkout.
 */
async function ensureDirectory(directory: string): Promise<string> {
  const absolute = resolve(process.cwd(), directory);
  await mkdir(absolute, { recursive: true });
  return absolute;
}

export type Database = ReturnType<typeof drizzlePglite<typeof schema>>;

export interface DatabaseHandle {
  db: Database;
  /** Runs every migration in apps/api/drizzle against this connection. */
  migrate: () => Promise<void>;
  close: () => Promise<void>;
  /** Postgres server, PGlite, or an in-memory test database. */
  kind: "postgres" | "pglite" | "memory";
}

/**
 * The query surface is identical for both drivers because both are Drizzle with
 * the same schema. PGlite's type is used as the canonical one; the Postgres
 * driver is cast at the boundary, which is the one place the difference lives.
 */
export async function createDatabase(options?: {
  /** Pass ":memory:" in tests to get a throwaway database per test file. */
  memory?: boolean;
}): Promise<DatabaseHandle> {
  if (config.databaseUrl.length > 0 && !options?.memory) {
    const client = postgres(config.databaseUrl, { max: 10 });
    const db = drizzlePostgres(client, { schema, casing: "snake_case" });
    return {
      db: db as unknown as Database,
      migrate: () => migratePostgres(db, { migrationsFolder: MIGRATIONS }),
      close: async () => {
        await client.end();
      },
      kind: "postgres",
    };
  }

  const client = options?.memory
    ? new PGlite("memory://zerotask")
    : new PGlite(await ensureDirectory(config.pgliteDir));

  const db = drizzlePglite(client, { schema, casing: "snake_case" });

  return {
    db,
    migrate: () => migratePglite(db, { migrationsFolder: MIGRATIONS }),
    close: () => client.close(),
    kind: options?.memory ? "memory" : "pglite",
  };
}

export type { schema };
