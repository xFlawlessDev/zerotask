import { Elysia, t } from "elysia";
import type { Database } from "../../db/client.ts";
import type { SessionUser } from "../../db/auth.ts";
import type { createGuards } from "../../lib/guards.ts";
import { overview, portfolio, workload } from "./service.ts";

type Deps = { db: Database };
type Guards = ReturnType<typeof createGuards>;

const dateOnly = t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" });

export function insightsModule(deps: Deps, guards: Guards) {
  return new Elysia({ name: "insights" })
    .use(guards)
    /** Everything the landing page shows, in one request. */
    .get(
      "/overview",
      ({ user }) =>
        overview(deps.db, { id: (user as SessionUser).id, role: (user as SessionUser).role as never }),
      { signedIn: true },
    )
    .get(
      "/portfolio",
      ({ user }) =>
        portfolio(deps.db, {
          id: (user as SessionUser).id,
          role: (user as SessionUser).role as never,
        }),
      { signedIn: true },
    )
    .get(
      "/workload",
      ({ query }) => workload(deps.db, query),
      {
        signedIn: true,
        query: t.Object({
          from: dateOnly,
          to: dateOnly,
          departmentId: t.Optional(t.String({ format: "uuid" })),
        }),
      },
    );
}
