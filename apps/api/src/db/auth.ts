import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";
import { config } from "../config.ts";
import type { Database } from "./client.ts";
import { accounts, sessions, users, verifications } from "./schema/index.ts";

/**
 * Session reads happen on nearly every request, so the caller's role is carried
 * in the session itself through `additionalFields`. `input: false` on `role`
 * means a sign-up request cannot grant itself admin.
 */
export function createAuth(db: Database) {
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: users, session: sessions, account: accounts, verification: verifications },
    }),
    secret: config.authSecret,
    baseURL: config.authUrl,
    /**
     * The handler is mounted at `/api/auth` in the app, so this is "/" — the mount
     * prefix is the whole public path: /api/auth/sign-in/email. Mounting at the
     * root instead would make Better Auth a catch-all that swallows every unknown
     * route's 404 body.
     */
    basePath: "/",
    trustedOrigins: config.webOrigins,
    plugins: [bearer()],
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      minPasswordLength: 10,
    },
    user: {
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "staff", input: false },
        departmentId: { type: "string", required: false, input: false },
        weeklyHours: { type: "number", required: false, defaultValue: 40, input: false },
        jobTitle: { type: "string", required: false },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 14,
      updateAge: 60 * 60 * 24,
    },
    advanced: {
      defaultCookieAttributes: { sameSite: "lax", httpOnly: true, secure: config.isProduction },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

/** The shape a session read returns, narrowed to what route handlers use. */
export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: string;
  departmentId: string | null;
  weeklyHours: number;
  jobTitle: string | null;
}
