import { Elysia, t } from "elysia";
import type { Database } from "../../db/client.ts";
import type { SessionUser } from "../../db/auth.ts";
import type { createGuards } from "../../lib/guards.ts";
import { ID } from "../../lib/validation.ts";
import { ActivityService, FavoriteService, NotificationService } from "./service.ts";

type Deps = { db: Database };
type Guards = ReturnType<typeof createGuards>;

export function notificationsModule(deps: Deps, guards: Guards) {
  return new Elysia({ name: "notifications" })
    .use(guards)
    .get(
      "/notifications",
      ({ user, query }) =>
        NotificationService.list(deps.db, (user as SessionUser).id, query),
      {
        signedIn: true,
        query: t.Object({
          limit: t.Optional(t.Integer({ minimum: 1, maximum: 100, default: 30 })),
          unreadOnly: t.Optional(t.Boolean()),
        }),
      },
    )
    .post("/notifications/read", ({ user, body }) => NotificationService.markRead(deps.db, (user as SessionUser).id, body.ids), {
      signedIn: true,
      body: t.Object({ ids: t.Array(ID, { maxItems: 200 }) }),
    })
    .post("/notifications/read-all", ({ user }) => NotificationService.markAllRead(deps.db, (user as SessionUser).id), {
      signedIn: true,
    })
    .get("/notification-preferences", ({ user }) => NotificationService.preferences(deps.db, (user as SessionUser).id), {
      signedIn: true,
    })
    .patch(
      "/notification-preferences",
      ({ user, body }) => NotificationService.updatePreferences(deps.db, (user as SessionUser).id, body),
      {
        signedIn: true,
        body: t.Object({
          emailEnabled: t.Optional(t.Boolean()),
          assignmentEmail: t.Optional(t.Boolean()),
          reviewEmail: t.Optional(t.Boolean()),
          scheduleEmail: t.Optional(t.Boolean()),
        }),
      },
    )
    .get(
      "/projects/:projectId/activity",
      ({ projectId, query }) => ActivityService.forProject(deps.db, projectId, query.limit ?? 40),
      {
        projectAccess: "projectId",
        params: t.Object({ projectId: ID }),
        query: t.Object({ limit: t.Optional(t.Integer({ minimum: 1, maximum: 200 })) }),
      },
    )
    .get("/my-work/activity", ({ user, query }) => ActivityService.forPerson(deps.db, (user as SessionUser).id, query.limit ?? 40), {
      signedIn: true,
      query: t.Object({ limit: t.Optional(t.Integer({ minimum: 1, maximum: 200 })) }),
    })
    .get("/favorites", ({ user }) => FavoriteService.list(deps.db, (user as SessionUser).id), {
      signedIn: true,
    })
    .post(
      "/favorites",
      ({ user, body }) => FavoriteService.add(deps.db, (user as SessionUser).id, body),
      {
        signedIn: true,
        body: t.Object({
          kind: t.Union([t.Literal("project"), t.Literal("task"), t.Literal("document")]),
          entityId: ID,
        }),
      },
    )
    .delete(
      "/favorites/:kind/:entityId",
      ({ user, params }) =>
        FavoriteService.remove(deps.db, (user as SessionUser).id, params.kind, params.entityId),
      {
        signedIn: true,
        params: t.Object({ kind: t.String(), entityId: ID }),
      },
    );
}





