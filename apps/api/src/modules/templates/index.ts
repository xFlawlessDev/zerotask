import { Elysia, t } from "elysia";
import type { Database } from "../../db/client.ts";
import type { SessionUser } from "../../db/auth.ts";
import type { createGuards } from "../../lib/guards.ts";
import { ID, taskPriority, text } from "../../lib/validation.ts";
import { TemplateService } from "./service.ts";

type Deps = { db: Database };
type Guards = ReturnType<typeof createGuards>;

export function templatesModule(deps: Deps, guards: Guards) {
  return new Elysia({ prefix: "/templates" })
    .use(guards)
    .get("/", () => TemplateService.list(deps.db), { signedIn: true })
    .get("/:templateId", ({ params }) => TemplateService.detail(deps.db, params.templateId), {
      signedIn: true,
      params: t.Object({ templateId: ID }),
    })
    .post(
      "/",
      ({ user, body }) => TemplateService.create(deps.db, body, (user as SessionUser).id),
      {
        admin: true,
        body: t.Object({
          name: text(120, 2),
          description: t.Optional(t.Union([text(1000), t.Null()])),
          category: t.Optional(t.String({ maxLength: 40 })),
          tasks: t.Optional(
            t.Array(
              t.Object({
                code: text(20, 1),
                name: text(200, 2),
                durationDays: t.Optional(t.Integer({ minimum: 1, maximum: 3650 })),
                priority: t.Optional(taskPriority),
                estimatedHours: t.Optional(t.Union([t.Number({ minimum: 0 }), t.Null()])),
                description: t.Optional(t.Union([text(2000), t.Null()])),
              }),
              { maxItems: 500 },
            ),
          ),
          dependencies: t.Optional(
            t.Array(
              t.Object({
                predecessorCode: t.String({ maxLength: 20 }),
                successorCode: t.String({ maxLength: 20 }),
                type: t.Optional(
                  t.Union([t.Literal("fs"), t.Literal("ss"), t.Literal("ff"), t.Literal("sf")]),
                ),
                lagDays: t.Optional(t.Integer({ minimum: -365, maximum: 365 })),
              }),
              { maxItems: 1000 },
            ),
          ),
        }),
      },
    )
    .delete("/:templateId", ({ params }) => TemplateService.remove(deps.db, params.templateId), {
      admin: true,
      params: t.Object({ templateId: ID }),
    })
    /** Capture an existing plan as a reusable template. */
    .post(
      "/capture",
      ({ user, body }) =>
        TemplateService.captureFromProject(
          deps.db,
          body.projectId,
          {
            name: body.name,
            category: body.category,
          },
          (user as SessionUser).id,
        ),
      {
        admin: true,
        body: t.Object({
          projectId: ID,
          name: text(120, 2),
          category: t.Optional(t.String({ maxLength: 40 })),
        }),
      },
    )
    .post(
      "/:templateId/instantiate",
      ({ user, params, body }) =>
        TemplateService.instantiate(deps.db, params.templateId, body, (user as SessionUser).id),
      {
        atLeast: "lead",
        params: t.Object({ templateId: ID }),
        body: t.Object({
          name: text(120, 2),
          kickoffDate: t.Optional(t.Union([t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }), t.Null()])),
          ownerId: t.Optional(ID),
        }),
      },
    );
}


