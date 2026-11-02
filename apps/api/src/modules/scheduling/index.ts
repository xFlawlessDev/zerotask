import { Elysia, t } from "elysia";
import type { Database } from "../../db/client.ts";
import type { SessionUser } from "../../db/auth.ts";
import type { createGuards } from "../../lib/guards.ts";
import { ProjectModel } from "../projects/model.ts";
import { SchedulingService } from "./service.ts";

type Deps = { db: Database };
type Guards = ReturnType<typeof createGuards>;

const projectParams = t.Object({ projectId: t.String({ format: "uuid" }) });
const revisionParams = t.Object({
  projectId: t.String({ format: "uuid" }),
  revisionId: t.String({ format: "uuid" }),
});

export function schedulingModule(deps: Deps, guards: Guards) {
  return new Elysia({ name: "scheduling" })
    .use(guards)
    .get(
      "/projects/:projectId/schedule",
      ({ projectId }) => SchedulingService.summary(deps.db, projectId),
      { projectAccess: "projectId", params: projectParams },
    )
    /** Everything the Gantt draws, in one payload: bars, links, and the axis range. */
    .get(
      "/projects/:projectId/schedule/holiday-comparison",
      ({ projectId }) => SchedulingService.holidayComparison(deps.db, projectId),
      { projectAccess: "projectId", params: projectParams },
    )
    .get(
      "/projects/:projectId/schedule/timeline",
      ({ projectId }) => SchedulingService.timeline(deps.db, projectId),
      { projectAccess: "projectId", params: projectParams },
    )
    .post(
      "/projects/:projectId/schedule/run",
      ({ user, projectId }) =>
        SchedulingService.recalculate(deps.db, projectId, (user as SessionUser).id),
      {
        projectRole: { param: "projectId", minimum: "member" },
        params: projectParams,
      },
    )
    .get(
      "/projects/:projectId/schedule/revisions",
      ({ projectId }) => SchedulingService.revisions(deps.db, projectId),
      { projectAccess: "projectId", params: projectParams },
    )
    .post(
      "/projects/:projectId/schedule/revisions",
      ({ user, projectId, body }) =>
        SchedulingService.proposeRevision(deps.db, projectId, body, (user as SessionUser).id),
      {
        projectRole: { param: "projectId", minimum: "manager" },
        params: projectParams,
        body: ProjectModel.revision,
      },
    )
    .post(
      "/projects/:projectId/schedule/revisions/:revisionId/approve",
      ({ user, projectId, params, body }) =>
        SchedulingService.decideRevision(
          deps.db,
          projectId,
          params.revisionId,
          "approved",
          (user as SessionUser).id,
          body?.note,
        ),
      {
        projectRole: { param: "projectId", minimum: "manager" },
        params: revisionParams,
        body: ProjectModel.decision,
      },
    )
    .post(
      "/projects/:projectId/schedule/revisions/:revisionId/reject",
      ({ user, projectId, params, body }) =>
        SchedulingService.decideRevision(
          deps.db,
          projectId,
          params.revisionId,
          "rejected",
          (user as SessionUser).id,
          body?.note,
        ),
      {
        projectRole: { param: "projectId", minimum: "manager" },
        params: revisionParams,
        body: ProjectModel.decision,
      },
    );
}

