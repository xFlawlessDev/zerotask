import { config } from "./config.ts";
import { createDatabase } from "./db/client.ts";
import { createAuth } from "./db/auth.ts";
import { createApp } from "./app.ts";
import { startEmailWorker } from "./lib/email-worker.ts";

/**
 * Boot order matters: the database is migrated before the app is built, so a
 * fresh checkout serves a working API instead of 500s on every route that reads
 * a table that does not exist yet.
 */
async function main() {
  const database = await createDatabase();
  await database.migrate();

  const auth = createAuth(database.db);
  const app = createApp({ db: database.db, auth });

  if (config.emailWorkerEnabled) startEmailWorker(database.db);

  app.listen(config.port);

  console.log(`Zero Task API listening on http://localhost:${config.port}`);
  console.log(`  database: ${database.kind}`);
  console.log(`  auth:     ${config.authUrl}/api/auth`);
  console.log(`  allowed origins: ${config.webOrigins.join(", ")}`);

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received, closing connections`);
    await app.stop();
    await database.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error("Failed to start the API", error);
  process.exit(1);
});
