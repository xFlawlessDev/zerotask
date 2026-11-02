import { Elysia } from "elysia";
import { and, eq } from "drizzle-orm";
import type { ProjectRole, Role } from "@zerotask/domain";
import { projectRoleAtLeast, roleAtLeast } from "@zerotask/domain";
import { errors } from "./errors.ts";
import type { Database } from "../db/client.ts";
import type { Auth, SessionUser } from "../db/auth.ts";
import { projectMembers } from "../db/schema/index.ts";

export interface RequestContext {
  db: Database;
  auth: Auth;
}

/**
 * The context a project-scoped route receives. A named alias rather than an
 * inline object type: Elysia's macro inference only widens the handler context
 * correctly when `resolve` returns a named type.
 */
export type ProjectScope = {
  user: SessionUser;
  projectId: string;
  projectRole: ProjectRole;
};

export type SignedInScope = {
  user: SessionUser;
};

function readProjectId(params: unknown, key: string): string {
  const value = (params as Record<string, string | undefined> | undefined)?.[key];
  if (!value) throw errors.invalid(`Missing project id in route param "${key}"`);
  return value;
}

/**
 * The single source of authorization for the whole API.
 *
 * Platform checks (is there a session, what is the app role) and project checks
 * (what is this person to this project) are separate on purpose: an admin is not
 * implicitly a member of every project, but must never be locked out of one, so
 * admins are treated as project owners.
 *
 * `derive` and the macros must live on the same named instance. Elysia's type
 * inference depends on it: split them across two plugins and `user` degrades to
 * `unknown` inside `resolve`.
 */
export function createGuards(context: RequestContext) {
  return new Elysia({ name: "guards" })
    .derive({ as: "scoped" }, async ({ request }): Promise<{ user: SessionUser | null }> => {
      const session = await context.auth.api.getSession({ headers: request.headers });
      if (!session) return { user: null };

      const raw = session.user as typeof session.user & {
        role?: string;
        departmentId?: string | null;
        weeklyHours?: number | null;
        jobTitle?: string | null;
      };

      return {
        user: {
          id: raw.id,
          email: raw.email,
          name: raw.name ?? null,
          image: raw.image ?? null,
          role: raw.role ?? "staff",
          departmentId: raw.departmentId ?? null,
          weeklyHours: raw.weeklyHours ?? 40,
          jobTitle: raw.jobTitle ?? null,
        },
      };
    })
    .macro({
      /** A session exists. Everything that reads or writes data needs at least this. */
      signedIn: {
        resolve({ user }): SignedInScope {
          if (!user) throw errors.unauthorized();
          return { user };
        },
      },

      /** The caller's app-wide role is at least `minimum`. */
      atLeast: (minimum: Role) => ({
        resolve({ user }): SignedInScope {
          if (!user) throw errors.unauthorized();
          if (!roleAtLeast(user.role as Role, minimum)) {
            throw errors.forbidden(`This action needs ${minimum} access or higher`);
          }
          return { user };
        },
      }),

      admin: {
        resolve({ user }): SignedInScope {
          if (!user) throw errors.unauthorized();
          if (user.role !== "admin") throw errors.forbidden("This action needs an admin");
          return { user };
        },
      },

      /**
       * Any standing on the project, including viewer. Exposes `projectId` so a
       * handler never has to re-read the raw param.
       */
      projectAccess: (param: string) => ({
        async resolve({ user, params }): Promise<ProjectScope> {
          if (!user) throw errors.unauthorized();
          const projectId = readProjectId(params, param);

          if (user.role === "admin") {
            return { user, projectId, projectRole: "owner" };
          }

          const membership = await context.db.query.projectMembers.findFirst({
            where: and(
              eq(projectMembers.projectId, projectId),
              eq(projectMembers.userId, user.id),
            ),
          });

          if (!membership) throw errors.forbidden("You are not a member of this project");

          return { user, projectId, projectRole: membership.role };
        },
      }),

      /**
       * At least `minimum` on the project. Separate from `projectAccess`
       * because writing to a project and reading it are different questions.
       */
      projectRole: (options: { param: string; minimum: ProjectRole }) => ({
        async resolve({ user, params }): Promise<ProjectScope> {
          if (!user) throw errors.unauthorized();
          const projectId = readProjectId(params, options.param);

          if (user.role === "admin") {
            return { user, projectId, projectRole: "owner" };
          }

          const membership = await context.db.query.projectMembers.findFirst({
            where: and(
              eq(projectMembers.projectId, projectId),
              eq(projectMembers.userId, user.id),
            ),
          });

          if (!membership) throw errors.forbidden("You are not a member of this project");
          if (!projectRoleAtLeast(membership.role, options.minimum)) {
            throw errors.forbidden(`This action needs ${options.minimum} rights on the project`);
          }

          return { user, projectId, projectRole: membership.role };
        },
      }),
    });
}
