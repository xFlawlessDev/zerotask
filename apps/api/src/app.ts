import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { config } from "./config.ts";
import type { Database } from "./db/client.ts";
import type { Auth } from "./db/auth.ts";
import { createGuards, type RequestContext } from "./lib/guards.ts";
import { errorHandler } from "./lib/error-handler.ts";
import { errors } from "./lib/errors.ts";
import { authModule } from "./modules/auth/index.ts";
import { peopleModule } from "./modules/people/index.ts";
import { projectsModule } from "./modules/projects/index.ts";
import { tasksModule } from "./modules/tasks/index.ts";
import { schedulingModule } from "./modules/scheduling/index.ts";
import { submissionsModule } from "./modules/submissions/index.ts";
import { documentsModule } from "./modules/documents/index.ts";
import { templatesModule } from "./modules/templates/index.ts";
import { notificationsModule } from "./modules/notifications/index.ts";
import { insightsModule } from "./modules/insights/index.ts";

export interface AppDeps extends RequestContext {
  db: Database;
  auth: Auth;
}

/**
 * Builds the app from its dependencies instead of importing a global database.
 * That is what lets a test hand in an in-memory database and get a real HTTP
 * surface, with the same routes and the same guards.
 */
export function createApp(deps: AppDeps) {
  const guards = createGuards(deps);

  /**
   * The auth handler is mounted inside this prefixed app, so a mount path of
   * "/auth" lands at /api/auth. Better Auth's own basePath is "/" because the
   * mount prefix is the whole public path.
   */
  return new Elysia({ prefix: "/api" })
    .use(errorHandler)
    .use(
      cors({
        origin: config.webOrigins,
        credentials: true,
        allowedHeaders: ["Content-Type", "Authorization"],
        methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      }),
    )
    .use(guards)
    .get("/health", () => ({
      status: "ok" as const,
      database: deps.db ? "connected" : "missing",
      time: new Date().toISOString(),
    }))
    .use(authModule(deps, guards))
    .use(peopleModule(deps, guards))
    .use(projectsModule(deps, guards))
    .use(tasksModule(deps, guards))
    .use(schedulingModule(deps, guards))
    .use(submissionsModule(deps, guards))
    .use(documentsModule(deps, guards))
    .use(templatesModule(deps, guards))
    .use(notificationsModule(deps, guards))
    .use(insightsModule(deps, guards))
    /**
     * Accounts are created by an admin through POST /people, so the public sign-up
     * endpoint is closed here. It is declared before the mount so it wins over the
     * Better Auth catch-all. Better Auth's own `disableSignUp` is not used because it
     * also blocks the server-side signUpEmail call that the admin route depends on.
     */
    .post("/auth/sign-up/email", () => {
      throw errors.forbidden("Accounts are created by an admin. Ask your manager for access.");
    })
    /**
     * Better Auth owns sign-in, sign-out, and session refresh. Mounted at "/auth"
     * inside the /api-prefixed app, so the endpoints live at /api/auth/*: scoping it
     * here keeps its catch-all away from the domain routes, whose 404 bodies stay in
     * the error contract.
     */
    .mount("/auth", deps.auth.handler);
}

export type App = ReturnType<typeof createApp>;
