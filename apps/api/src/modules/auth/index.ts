import { Elysia, t } from "elysia";
import type { Database } from "../../db/client.ts";
import type { createGuards } from "../../lib/guards.ts";
import { PeopleService } from "../people/service.ts";
import { text } from "../../lib/validation.ts";

type Deps = { db: Database; auth: unknown };
type Guards = ReturnType<typeof createGuards>;

/**
 * Only the endpoints Better Auth does not already own. Sign-up, sign-in,
 * sign-out, and session refresh are mounted by the app under `/api/auth`, and
 * duplicating them here would create two ways to do the same thing.
 */
export function authModule(deps: Deps, guards: Guards) {
  return new Elysia({ prefix: "/account" })
    .use(guards)
    /**
     * Everything the shell needs on first paint, in one request: who am I, what
     * can I do, and where do I belong. Three round trips before the sidebar can
     * render is three round trips of blank screen.
     *
     * No guard here on purpose: a signed-out visitor gets `authenticated: false`
     * rather than a 401, because the web app asks this question before it knows
     * whether anyone is signed in.
     */
    .get("/session", async ({ user }) => {
      if (!user) return { authenticated: false as const };

      const person = await PeopleService.byId(deps.db, user.id);
      const departments = await PeopleService.listDepartments(deps.db);

      return {
        authenticated: true as const,
        user: person,
        capabilities: capabilitiesFor(person.role),
        departments,
      };
    })
    .patch(
      "/preferences",
      ({ user, body }) => PeopleService.updateSelf(deps.db, user!.id, body),
      {
        signedIn: true,
        body: t.Object({
          name: t.Optional(text(80)),
          jobTitle: t.Optional(t.Union([text(80), t.Null()])),
          weeklyHours: t.Optional(t.Integer({ minimum: 1, maximum: 80 })),
        }),
      },
    );
}

/**
 * What the UI is allowed to show. Computed once on the server so the sidebar and
 * every action button read from one description of the caller instead of
 * re-deriving "can they do this" in a dozen components.
 */
function capabilitiesFor(role: string) {
  return {
    role,
    managePeople: role === "admin",
    manageDepartments: role === "admin",
    manageTemplates: role === "admin",
    createProject: role === "admin" || role === "manager" || role === "lead",
    viewAllProjects: role === "admin",
  };
}

export type Capabilities = ReturnType<typeof capabilitiesFor>;
