import { createDatabase } from "./client.ts";

/**
 * Migration runner. Separate from boot so a deployment can migrate as its own
 * step, with the server still stopped.
 */
const database = await createDatabase();

try {
  await database.migrate();
  console.log(`Migrations applied to ${database.kind}`);
} finally {
  await database.close();
}
