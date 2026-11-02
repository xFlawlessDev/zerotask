import { Elysia, t } from "elysia";
import type { Database } from "../../db/client.ts";
import type { SessionUser } from "../../db/auth.ts";
import type { createGuards } from "../../lib/guards.ts";
import { errors } from "../../lib/errors.ts";
import { okResponse } from "../../lib/validation.ts";
import { TaskModel } from "./model.ts";
import { TaskService } from "./service.ts";
import { SchedulingService } from "../scheduling/service.ts";

type Deps = { db: Database };
type Guards = ReturnType<typeof createGuards>;

const projectParams = t.Object({ projectId: t.String({ format: "uuid" }) });
const taskParams = t.Object({
  projectId: t.String({ format: "uuid" }),
  taskId: t.String({ format: "uuid" }),
});

export function tasksModule(deps: Deps, guards: Guards) {
  return new Elysia({ name: "tasks" })
    .use(guards)
    /**
     * Personal views live on their own prefix. A task's own fields are the same
     * everywhere, but "assigned to me this fortnight" is not a project query and
     * putting it under /projects would mean inventing a fake project id.
     */
    .get(
      "/my-work",
      ({ user, query }) => TaskService.myWeek(deps.db, (user as SessionUser).id, query),
      {
        signedIn: true,
        query: t.Object({
          from: t.Optional(t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" })),
          to: t.Optional(t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" })),
        }),
      },
    )
    .get("/my-work/reviews", ({ user }) => TaskService.reviewQueue(deps.db, (user as SessionUser).id), {
      signedIn: true,
    })
    .get(
      "/my-work/upcoming",
      ({ user, query }) =>
        TaskService.upcoming(deps.db, (user as SessionUser).id, query.days ?? 7),
      {
        signedIn: true,
        query: t.Object({ days: t.Optional(t.Integer({ minimum: 1, maximum: 90 })) }),
      },
    )
    .get("/tasks", ({ query }) => TaskService.list(deps.db, { scope: "all" }, query), {
      admin: true,
      query: TaskModel.listQuery,
    })
    .get(
      "/projects/:projectId/tasks",
      ({ projectId, query }) => TaskService.list(deps.db, { scope: "project", projectId }, query),
      { projectAccess: "projectId", params: projectParams, query: TaskModel.listQuery },
    )
    .post(
      "/projects/:projectId/tasks",
      async ({ user, projectId, body }) => {
        const actorId = (user as SessionUser).id;
        const created = await TaskService.create(deps.db, projectId, body, actorId);
        // A new task can move the critical path, so the plan is recomputed before
        // the caller sees the task it just created.
        await SchedulingService.recalculate(deps.db, projectId, actorId, { silent: true });
        return TaskService.byId(deps.db, created.id);
      },
      { projectRole: { param: "projectId", minimum: "member" }, params: projectParams, body: TaskModel.create },
    )
    .get("/projects/:projectId/tasks/:taskId", ({ params }) => TaskService.detail(deps.db, params.taskId), {
      projectAccess: "projectId",
      params: taskParams,
    })
    .patch(
      "/projects/:projectId/tasks/:taskId",
      async ({ user, projectId, params, body, projectRole }) => {
        const actorId = (user as SessionUser).id;

        /**
         * Dates and duration are the plan. Everyone can work inside the plan,
         * only a manager can rewrite it, which is the whole reason the schedule
         * is trustworthy on the Gantt.
         */
        const touchesPlan =
          body.durationDays !== undefined ||
          body.plannedStartDate !== undefined ||
          body.plannedEndDate !== undefined;

        if (touchesPlan && projectRole === "member") {
          throw errors.forbidden("Changing dates or duration is a project manager action");
        }

        const updated = await TaskService.update(deps.db, params.taskId, body, actorId);
        if (touchesPlan || body.actualStartDate !== undefined || body.actualEndDate !== undefined || body.progressPercent !== undefined) {
          await SchedulingService.recalculate(deps.db, projectId, actorId, { silent: true });
        }
        return updated;
      },
      {
        projectRole: { param: "projectId", minimum: "member" },
        params: taskParams,
        body: TaskModel.update,
      },
    )
    .delete(
      "/projects/:projectId/tasks/:taskId",
      async ({ user, projectId, params }) => {
        const actorId = (user as SessionUser).id;
        const result = await TaskService.remove(deps.db, params.taskId, actorId);
        await SchedulingService.recalculate(deps.db, projectId, actorId, { silent: true });
        return result;
      },
      {
        projectRole: { param: "projectId", minimum: "manager" },
        params: taskParams,
        response: { 200: okResponse },
      },
    )
    .post(
      "/projects/:projectId/tasks/:taskId/move",
      async ({ user, projectId, params, body }) => {
        const actorId = (user as SessionUser).id;
        const moved = await TaskService.move(deps.db, params.taskId, body.status, actorId);
        await SchedulingService.recalculate(deps.db, projectId, actorId, { silent: true });
        return moved;
      },
      {
        projectRole: { param: "projectId", minimum: "member" },
        params: taskParams,
        body: TaskModel.move,
      },
    )
    .post(
      "/projects/:projectId/dependencies",
      async ({ user, projectId, body }) => {
        const actorId = (user as SessionUser).id;
        const updated = await TaskService.addDependency(deps.db, projectId, body, actorId);
        await SchedulingService.recalculate(deps.db, projectId, actorId, { silent: true });
        return updated;
      },
      {
        projectRole: { param: "projectId", minimum: "member" },
        params: projectParams,
        body: TaskModel.dependency,
      },
    )
    .delete(
      "/projects/:projectId/dependencies/:dependencyId",
      async ({ user, projectId, params }) => {
        const actorId = (user as SessionUser).id;
        const result = await TaskService.removeDependency(deps.db, projectId, params.dependencyId, actorId);
        await SchedulingService.recalculate(deps.db, projectId, actorId, { silent: true });
        return result;
      },
      {
        projectRole: { param: "projectId", minimum: "member" },
        params: t.Object({
          projectId: t.String({ format: "uuid" }),
          dependencyId: t.String({ format: "uuid" }),
        }),
        response: { 200: okResponse },
      },
    )
    .patch(
      "/projects/:projectId/tasks/:taskId/labels",
      ({ params, body }) => TaskService.setLabels(deps.db, params.taskId, body.labelIds),
      {
        projectRole: { param: "projectId", minimum: "member" },
        params: taskParams,
        body: TaskModel.labelAssignment,
      },
    )
    .post(
      "/projects/:projectId/tasks/:taskId/work-logs",
      ({ user, params, body }) =>
        TaskService.logWork(deps.db, params.taskId, (user as SessionUser).id, body),
      {
        projectRole: { param: "projectId", minimum: "member" },
        params: taskParams,
        body: TaskModel.workLog,
      },
    )
    .delete(
      "/projects/:projectId/tasks/:taskId/work-logs/:logId",
      ({ user, params }) =>
        TaskService.removeWorkLog(
          deps.db,
          params.taskId,
          params.logId,
          (user as SessionUser).id,
          (user as SessionUser).role === "admin",
        ),
      {
        projectRole: { param: "projectId", minimum: "member" },
        params: t.Object({
          projectId: t.String({ format: "uuid" }),
          taskId: t.String({ format: "uuid" }),
          logId: t.String({ format: "uuid" }),
        }),
        response: { 200: okResponse },
      },
    )
    .post(
      "/projects/:projectId/tasks/:taskId/checklist",
      ({ params, body }) => TaskService.addChecklistItem(deps.db, params.taskId, body.title),
      {
        projectRole: { param: "projectId", minimum: "member" },
        params: taskParams,
        body: TaskModel.checklistItem,
      },
    )
    .patch(
      "/projects/:projectId/tasks/:taskId/checklist/:itemId",
      ({ user, params, body }) =>
        TaskService.toggleChecklistItem(
          deps.db,
          params.taskId,
          params.itemId,
          body.done,
          (user as SessionUser).id,
        ),
      {
        projectRole: { param: "projectId", minimum: "member" },
        params: t.Object({
          projectId: t.String({ format: "uuid" }),
          taskId: t.String({ format: "uuid" }),
          itemId: t.String({ format: "uuid" }),
        }),
        body: t.Object({ done: t.Boolean() }),
      },
    )
    .post(
      "/projects/:projectId/tasks/:taskId/comments",
      ({ user, params, body }) =>
        TaskService.addComment(deps.db, params.taskId, (user as SessionUser).id, body),
      {
        projectRole: { param: "projectId", minimum: "member" },
        params: taskParams,
        body: TaskModel.comment,
      },
    )
    .delete(
      "/projects/:projectId/tasks/:taskId/comments/:commentId",
      ({ user, params }) =>
        TaskService.removeComment(
          deps.db,
          params.taskId,
          params.commentId,
          (user as SessionUser).id,
          (user as SessionUser).role === "admin",
        ),
      {
        projectRole: { param: "projectId", minimum: "member" },
        params: t.Object({
          projectId: t.String({ format: "uuid" }),
          taskId: t.String({ format: "uuid" }),
          commentId: t.String({ format: "uuid" }),
        }),
      },
    )
    .put(
      "/projects/:projectId/tasks/:taskId/approval-config",
      ({ params, body }) => TaskService.setApprovalConfig(deps.db, params.taskId, body),
      {
        projectRole: { param: "projectId", minimum: "manager" },
        params: taskParams,
        body: TaskModel.approvalConfig,
      },
    )
    .post(
      "/projects/:projectId/tasks/:taskId/watchers",
      ({ params, body }) => TaskService.addWatcher(deps.db, params.taskId, body.userId),
      {
        projectRole: { param: "projectId", minimum: "member" },
        params: taskParams,
        body: TaskModel.watcher,
      },
    )
    .delete(
      "/projects/:projectId/tasks/:taskId/watchers/:userId",
      ({ params }) => TaskService.removeWatcher(deps.db, params.taskId, params.userId),
      {
        projectRole: { param: "projectId", minimum: "member" },
        params: t.Object({
          projectId: t.String({ format: "uuid" }),
          taskId: t.String({ format: "uuid" }),
          userId: t.String(),
        }),
      },
    );
}

