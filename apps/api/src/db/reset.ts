import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { config } from "../config.ts";

/**
 * Drops the embedded database directory so the next boot starts from a clean
 * migrate. Refuses to touch a real Postgres: that would need an explicit drop
 * statement, not a deleted file.
 */
if (config.databaseUrl) {
  console.error(
    "Refusing to reset: DATABASE_URL is set. This command only resets the embedded database.",
  );
  process.exit(1);
}

const target = resolve(process.cwd(), config.pgliteDir);
await rm(target, { recursive: true, force: true });
console.log(`Removed ${target}. The next start will migrate a fresh database.`);
