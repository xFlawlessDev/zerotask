/**
 * Starts the API for the E2E run on its own port and its own database directory.
 *
 * The database is seeded by the real seed script in a child process before the
 * server binds, so the tests always see the same demo workspace. Environment
 * variables are set before any API module is imported, because the config module
 * reads them once at load time.
 */
import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const port = 3410;
// Absolute so the seed child (cwd apps/api) and this process share one database.
const pgliteDir = resolve(import.meta.dir, "../../.data/e2e/pg");

// Start every run from an empty database. This happens here, before the server
// opens the database, so nothing is deleted out from under a running process.
await rm(pgliteDir, { recursive: true, force: true });

Object.assign(process.env, {
  PORT: String(port),
  PGLITE_DIR: pgliteDir,
  WEB_ORIGIN: "http://localhost:5193",
  BETTER_AUTH_URL: `http://localhost:${port}`,
  EMAIL_WORKER_ENABLED: "false",
  NODE_ENV: "test",
});

const seed = Bun.spawnSync(["bun", "run", "src/db/seed.ts"], {
  cwd: "apps/api",
  env: process.env,
  stdout: "pipe",
  stderr: "pipe",
});

if (seed.exitCode !== 0) {
  console.error(seed.stderr.toString());
  process.exit(1);
}

await import("../../apps/api/src/main.ts");
