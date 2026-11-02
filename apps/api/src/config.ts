/**
 * Every environment read happens here, once, so a missing value fails at boot
 * with a usable message instead of midway through a request.
 */

function readString(key: string, fallback: string): string {
  const value = Bun.env[key];
  return value && value.length > 0 ? value : fallback;
}

function readList(key: string, fallback: string[]): string[] {
  const value = Bun.env[key];
  if (!value) return fallback;
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

const isProduction = Bun.env.NODE_ENV === "production";

const secret = readString("BETTER_AUTH_SECRET", "dev-only-secret-change-me-0123456789abcdef");

if (isProduction && secret.startsWith("dev-only")) {
  throw new Error(
    "BETTER_AUTH_SECRET must be set to a real secret in production. Generate one with: openssl rand -base64 32",
  );
}

export const config = {
  isProduction,
  port: Number.parseInt(readString("PORT", "3400"), 10),
  authSecret: secret,
  authUrl: readString("BETTER_AUTH_URL", "http://localhost:3400"),
  webOrigins: readList("WEB_ORIGIN", ["http://localhost:5183"]),
  /**
   * An empty DATABASE_URL selects the embedded PGlite database, which keeps a
   * lone developer from needing a Postgres server. Any real deployment sets a
   * connection string and gets the real driver.
   */
  databaseUrl: Bun.env.DATABASE_URL ?? "",
  pgliteDir: readString("PGLITE_DIR", ".data/pg"),
  emailWorkerEnabled: readString("EMAIL_WORKER_ENABLED", "true") !== "false",
  maxUploadBytes: 25 * 1024 * 1024,
  uploadDir: readString("UPLOAD_DIR", ".data/uploads"),
} as const;

export type Config = typeof config;
