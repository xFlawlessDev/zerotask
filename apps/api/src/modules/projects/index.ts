import { Elysia, t } from "elysia";
import type { Database } from "../../db/client.ts";
import type { SessionUser } from "../../db/auth.ts";
import type { createGuards } from "../../lib/guards.ts";
import { idParams, okResponse } from "../../lib/validation.ts";
import { ProjectModel } from "./model.ts";
import { ID } from "../../lib/validation.ts";
import { ProjectService } from "./service.ts";
import { projectRoleAtLeast } from "@zerotask/domain";

type Deps = { db: Database };
type Guards = ReturnType<typeof createGuards>;

/**
 * Route order matters: `/projects/:projectId` would also match `/projects/mine`,
 * so anything static is declared first. The guards also expose `projectId` and
 * `projectRole`, which means handlers never re-read a raw path param or repeat a
 * membership query.
 */
export function projectsModule(deps: Deps, guards: Guards) {
  return new Elysia({ prefix: "/projects" })
    .use(guards)
    .get("/", ({ user, query }) => ProjectService.list(deps.db, user as SessionUser, query), {
      signedIn: true,
      query: ProjectModel.listQuery,
    })
    /** The rail: every project this person can open, in one small payload. */
    .get("/mine", ({ user }) => ProjectService.forPerson(deps.db, (user as SessionUser).id), {
      signedIn: true,
    })
    .post(
      "/",
      ({ user, body }) => ProjectService.create(deps.db, body, (user as SessionUser).id),
      { atLeast: "lead", body: ProjectModel.create },
    )
    .get("/:projectId", ({ projectId }) => ProjectService.detail(deps.db, projectId), {
      projectAccess: "projectId",
      params: t.Object({ projectId: t.String({ format: "uuid" }) }),
    })
    /**
     * Editing the plan is a manager action, but changing the status is not: a
     * lead who notices the work is done should be able to say so.
     */
    .patch(
      "/:projectId",
      ({ user, projectId, body, projectRole }) => {
        const touchesPlan =
          body.targetLaunchDate !== undefined ||
          body.kickoffDate !== undefined ||
          body.leadTimeDays !== undefined;

        if (touchesPlan && !projectRoleAtLeast(projectRole, "manager")) {
          return ProjectService.update(
            deps.db,
            projectId,
            { status: body.status },
            (user as SessionUser).id,
          );
        }

        return ProjectService.update(deps.db, projectId, body, (user as SessionUser).id);
      },
      {
        projectRole: { param: "projectId", minimum: "member" },
        params: t.Object({ projectId: t.String({ format: "uuid" }) }),
        body: ProjectModel.update,
      },
    )
    .delete("/:projectId", ({ user, projectId }) => ProjectService.remove(deps.db, projectId, (user as SessionUser).id), {
      projectRole: { param: "projectId", minimum: "owner" },
      params: t.Object({ projectId: t.String({ format: "uuid" }) }),
      response: { 200: okResponse },
    })
    .get("/:projectId/members", ({ projectId }) => ProjectService.members(deps.db, projectId), {
      projectAccess: "projectId",
      params: t.Object({ projectId: t.String({ format: "uuid" }) }),
    })
    .post(
      "/:projectId/members",
      ({ user, projectId, body }) =>
        ProjectService.addMember(deps.db, projectId, body, (user as SessionUser).id),
      {
        projectRole: { param: "projectId", minimum: "manager" },
        params: t.Object({ projectId: t.String({ format: "uuid" }) }),
        body: ProjectModel.addMember,
      },
    )
    .patch(
      "/:projectId/members/:memberId",
      ({ user, projectId, params, body }) =>
        ProjectService.updateMember(deps.db, projectId, params.memberId, body.role, (user as SessionUser).id),
      {
        projectRole: { param: "projectId", minimum: "manager" },
        params: t.Object({
          projectId: t.String({ format: "uuid" }),
          memberId: ID,
        }),
        body: ProjectModel.updateMember,
      },
    )
    .delete(
      "/:projectId/members/:memberId",
      ({ user, projectId, params }) =>
        ProjectService.removeMember(deps.db, projectId, params.memberId, (user as SessionUser).id),
      {
        projectRole: { param: "projectId", minimum: "manager" },
        params: t.Object({
          projectId: t.String({ format: "uuid" }),
          memberId: ID,
        }),
        response: { 200: okResponse },
      },
    )
    .post(
      "/:projectId/milestones",
      ({ user, projectId, body }) =>
        ProjectService.createMilestone(deps.db, projectId, body, (user as SessionUser).id),
      {
        projectRole: { param: "projectId", minimum: "member" },
        params: t.Object({ projectId: t.String({ format: "uuid" }) }),
        body: ProjectModel.milestone,
      },
    )
    .patch(
      "/:projectId/milestones/:milestoneId",
      ({ projectId, params, body }) =>
        ProjectService.updateMilestone(deps.db, projectId, params.milestoneId, body),
      {
        projectRole: { param: "projectId", minimum: "member" },
        params: t.Object({
          projectId: t.String({ format: "uuid" }),
          milestoneId: t.String({ format: "uuid" }),
        }),
        body: ProjectModel.milestoneUpdate,
      },
    )
    .delete(
      "/:projectId/milestones/:milestoneId",
      ({ projectId, params }) =>
        ProjectService.removeMilestone(deps.db, projectId, params.milestoneId),
      {
        projectRole: { param: "projectId", minimum: "manager" },
        params: t.Object({
          projectId: t.String({ format: "uuid" }),
          milestoneId: t.String({ format: "uuid" }),
        }),
      },
    )
    .post("/:projectId/labels", ({ projectId, body }) => ProjectService.createLabel(deps.db, projectId, body), {
      projectRole: { param: "projectId", minimum: "member" },
      params: t.Object({ projectId: t.String({ format: "uuid" }) }),
      body: ProjectModel.label,
    })
    .delete("/:projectId/labels/:labelId", ({ projectId, params }) => ProjectService.removeLabel(deps.db, projectId, params.labelId), {
      projectRole: { param: "projectId", minimum: "manager" },
      params: t.Object({
        projectId: t.String({ format: "uuid" }),
        labelId: t.String({ format: "uuid" }),
      }),
    });
}

export { idParams };
