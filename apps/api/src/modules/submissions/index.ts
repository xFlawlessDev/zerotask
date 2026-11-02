import { Elysia, t } from "elysia";
import type { Database } from "../../db/client.ts";
import type { SessionUser } from "../../db/auth.ts";
import type { createGuards } from "../../lib/guards.ts";
import { SubmissionModel } from "./model.ts";
import { SubmissionService } from "./service.ts";

type Deps = { db: Database };
type Guards = ReturnType<typeof createGuards>;

const projectParams = t.Object({ projectId: t.String({ format: "uuid" }) });
const submissionParams = t.Object({
  projectId: t.String({ format: "uuid" }),
  submissionId: t.String({ format: "uuid" }),
});

export function submissionsModule(deps: Deps, guards: Guards) {
  return new Elysia({ name: "submissions" })
    .use(guards)
    .get(
      "/projects/:projectId/submissions",
      ({ projectId, query }) => SubmissionService.list(deps.db, projectId, query),
      { projectAccess: "projectId", params: projectParams, query: SubmissionModel.listQuery },
    )
    .post(
      "/projects/:projectId/tasks/:taskId/submissions",
      ({ user, projectId, params, body }) =>
        SubmissionService.create(deps.db, projectId, params.taskId, (user as SessionUser).id, body),
      {
        projectRole: { param: "projectId", minimum: "member" },
        params: t.Object({
          projectId: t.String({ format: "uuid" }),
          taskId: t.String({ format: "uuid" }),
        }),
        body: SubmissionModel.create,
      },
    )
    /**
     * Reviewers may not be project managers, so this route checks eligibility in
     * the service by looking at the frozen reviewer list rather than by project
     * role. Membership is still required to see the submission at all.
     */
    .post(
      "/projects/:projectId/submissions/:submissionId/approve",
      ({ user, projectId, params, body }) =>
        SubmissionService.decide(
          deps.db,
          projectId,
          params.submissionId,
          (user as SessionUser).id,
          (user as SessionUser).role,
          "approved",
          body?.note,
        ),
      {
        projectRole: { param: "projectId", minimum: "viewer" },
        params: submissionParams,
        body: SubmissionModel.decide,
      },
    )
    .post(
      "/projects/:projectId/submissions/:submissionId/reject",
      ({ user, projectId, params, body }) =>
        SubmissionService.decide(
          deps.db,
          projectId,
          params.submissionId,
          (user as SessionUser).id,
          (user as SessionUser).role,
          "rejected",
          body?.note,
        ),
      {
        projectRole: { param: "projectId", minimum: "viewer" },
        params: submissionParams,
        body: SubmissionModel.decide,
      },
    );
}
