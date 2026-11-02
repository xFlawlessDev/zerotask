import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { TaskPriority, TaskStatus } from "@zerotask/domain";
import type { Database } from "../../db/client.ts";
import {
  checklistItems,
  comments,
  labels,
  projectMembers,
  projects,
  submissions,
  taskApprovalConfig,
  taskApprovers,
  taskDependencies,
  taskLabels,
  tasks,
  users,
  watchers,
  workLogs,
  milestones,
  departments,
} from "../../db/schema/index.ts";
import { errors } from "../../lib/errors.ts";
import { nextTaskCode } from "../../lib/codes.ts";
import { notify, projectAudience, recordActivity } from "../../lib/events.ts";
import { cref } from "../../lib/sql.ts";

/** Live statuses, as a raw SQL list for use inside a subquery. */
const OPEN = sql`('not_started','in_progress','pending_review','blocked')`;

export interface TaskRow {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  code: string;
  name: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  durationDays: number;
  estimatedHours: string | null;
  progressPercent: number;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  earlyStart: string | null;
  earlyFinish: string | null;
  lateStart: string | null;
  lateFinish: string | null;
  totalFloatDays: number | null;
  isCritical: boolean;
  sortOrder: number;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeImage: string | null;
  reviewerId: string | null;
  reviewerName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  milestoneId: string | null;
  milestoneName: string | null;
  loggedHours: number;
  updatedAt: Date;
}

/**
 * Every task list returns the same row, so a card in the board, a row in the
 * table, and a bar in the Gantt all read from one shape. The alternative, one
 * projection per screen, is how labels and counts drift between views.
 */
const taskColumns = {
  id: tasks.id,
  projectId: tasks.projectId,
  projectCode: projects.code,
  projectName: projects.name,
  code: tasks.code,
  name: tasks.name,
  description: tasks.description,
  status: tasks.status,
  priority: tasks.priority,
  durationDays: tasks.durationDays,
  estimatedHours: tasks.estimatedHours,
  progressPercent: tasks.progressPercent,
  plannedStartDate: tasks.plannedStartDate,
  plannedEndDate: tasks.plannedEndDate,
  actualStartDate: tasks.actualStartDate,
  actualEndDate: tasks.actualEndDate,
  earlyStart: tasks.earlyStart,
  earlyFinish: tasks.earlyFinish,
  lateStart: tasks.lateStart,
  lateFinish: tasks.lateFinish,
  totalFloatDays: tasks.totalFloatDays,
  isCritical: tasks.isCritical,
  sortOrder: tasks.sortOrder,
  assigneeId: tasks.assignedToId,
  assigneeName: users.name,
  assigneeImage: users.image,
  reviewerId: tasks.reviewerId,
  departmentId: tasks.departmentId,
  departmentName: departments.name,
  milestoneId: tasks.milestoneId,
  milestoneName: milestones.name,
  loggedHours: sql<number>`coalesce((
    select sum(${cref("work_logs", "hours")})::float from ${sql.identifier("work_logs")}
    where ${cref("work_logs", "task_id")} = ${cref("tasks", "id")}
  ), 0)`,
  updatedAt: tasks.updatedAt,
};

export const TaskService = {
  async list(
    db: Database,
    filter:
      | { scope: "project"; projectId: string }
      | { scope: "assignee"; userId: string }
      | { scope: "all" },
    options: {
      status?: TaskStatus | TaskStatus[];
      priority?: TaskPriority;
      assigneeId?: string;
      departmentId?: string;
      milestoneId?: string;
      labelId?: string;
      search?: string;
      criticalOnly?: boolean;
      order?: "code" | "start" | "due" | "priority" | "float";
      limit?: number;
      offset?: number;
    },
  ) {
    const filters = [isNull(tasks.deletedAt)];

    if (filter.scope === "project") filters.push(eq(tasks.projectId, filter.projectId));
    if (filter.scope === "assignee") filters.push(eq(tasks.assignedToId, filter.userId));

    if (options.status) {
      filters.push(
        Array.isArray(options.status)
          ? inArray(tasks.status, options.status)
          : eq(tasks.status, options.status),
      );
    }
    if (options.priority) filters.push(eq(tasks.priority, options.priority));
    if (options.assigneeId) filters.push(eq(tasks.assignedToId, options.assigneeId));
    if (options.departmentId) filters.push(eq(tasks.departmentId, options.departmentId));
    if (options.milestoneId) filters.push(eq(tasks.milestoneId, options.milestoneId));
    if (options.criticalOnly) filters.push(eq(tasks.isCritical, true));
    if (options.search) {
      const pattern = `%${options.search}%`;
      filters.push(or(ilike(tasks.name, pattern), ilike(tasks.code, pattern))!);
    }
    if (options.labelId) {
      filters.push(
        sql`exists (
          select 1 from ${sql.identifier("task_labels")}
          where ${cref("task_labels", "task_id")} = ${cref("tasks", "id")}
            and ${cref("task_labels", "label_id")} = ${options.labelId}
        )`,
      );
    }

    const priorityOrder = sql`case ${tasks.priority}
      when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end`;

    const orderBy =
      options.order === "start"
        ? asc(sql`coalesce(${tasks.earlyStart}, ${tasks.plannedStartDate}, '9999-12-31'::date)`)
        : options.order === "due"
          ? asc(sql`coalesce(${tasks.plannedEndDate}, '9999-12-31'::date)`)
          : options.order === "priority"
            ? asc(priorityOrder)
            : options.order === "float"
              ? asc(sql`coalesce(${tasks.totalFloatDays}, 9999)`)
              : asc(tasks.code);

    const where = and(...filters);

    const [items, [total]] = await Promise.all([
      db
        .select(taskColumns)
        .from(tasks)
        .innerJoin(projects, eq(projects.id, tasks.projectId))
        .leftJoin(users, eq(users.id, tasks.assignedToId))
        .leftJoin(departments, eq(departments.id, tasks.departmentId))
        .leftJoin(milestones, eq(milestones.id, tasks.milestoneId))
        .where(where)
        .orderBy(orderBy)
        .limit(options.limit ?? 200)
        .offset(options.offset ?? 0),
      db.select({ value: count() }).from(tasks).where(where),
    ]);

    const withLabels = await TaskService.attachLabels(db, items);
    return { items: withLabels, total: total?.value ?? 0 };
  },

  /** Labels for a page of tasks in one query, not one query per row. */
  async attachLabels<T extends { id: string }>(db: Database, rows: T[]) {
    if (rows.length === 0) return rows.map((row) => ({ ...row, labels: [] as { id: string; name: string; color: string }[] }));

    const links = await db
      .select({
        taskId: taskLabels.taskId,
        id: labels.id,
        name: labels.name,
        color: labels.color,
      })
      .from(taskLabels)
      .innerJoin(labels, eq(labels.id, taskLabels.labelId))
      .where(inArray(taskLabels.taskId, rows.map((row) => row.id)));

    const byTask = new Map<string, { id: string; name: string; color: string }[]>();
    for (const link of links) {
      const bucket = byTask.get(link.taskId) ?? [];
      bucket.push({ id: link.id, name: link.name, color: link.color });
      byTask.set(link.taskId, bucket);
    }

    return rows.map((row) => ({ ...row, labels: byTask.get(row.id) ?? [] }));
  },

  async byId(db: Database, taskId: string) {
    const [row] = await db
      .select(taskColumns)
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .leftJoin(users, eq(users.id, tasks.assignedToId))
      .leftJoin(departments, eq(departments.id, tasks.departmentId))
      .leftJoin(milestones, eq(milestones.id, tasks.milestoneId))
      .where(and(eq(tasks.id, taskId), isNull(tasks.deletedAt)));

    if (!row) throw errors.notFound("Task");
    return row;
  },

  /**
   * The task panel is one request: the task, its links, its checklist, its
   * comments, its logs, and its approval configuration. Opening a task should not
   * fire six queries and flash six spinners.
   */
  async detail(db: Database, taskId: string) {
    const task = await TaskService.byId(db, taskId);

    const [
      links,
      checklist,
      commentRows,
      logs,
      approval,
      watcherRows,
      submissionRows,
      labelRows,
    ] = await Promise.all([
      TaskService.dependencies(db, taskId),
      db
        .select()
        .from(checklistItems)
        .where(eq(checklistItems.taskId, taskId))
        .orderBy(asc(checklistItems.sortOrder), asc(checklistItems.createdAt)),
      db
        .select({
          id: comments.id,
          body: comments.body,
          parentId: comments.parentId,
          createdAt: comments.createdAt,
          editedAt: comments.editedAt,
          authorId: users.id,
          authorName: users.name,
          authorImage: users.image,
        })
        .from(comments)
        .innerJoin(users, eq(users.id, comments.authorId))
        .where(and(eq(comments.taskId, taskId), isNull(comments.deletedAt)))
        .orderBy(asc(comments.createdAt)),
      db
        .select({
          id: workLogs.id,
          logDate: workLogs.logDate,
          hours: workLogs.hours,
          note: workLogs.note,
          userId: users.id,
          userName: users.name,
        })
        .from(workLogs)
        .innerJoin(users, eq(users.id, workLogs.userId))
        .where(eq(workLogs.taskId, taskId))
        .orderBy(desc(workLogs.logDate)),
      db.query.taskApprovalConfig.findFirst({ where: eq(taskApprovalConfig.taskId, taskId) }),
      db
        .select({ userId: watchers.userId, name: users.name, email: users.email, image: users.image })
        .from(watchers)
        .innerJoin(users, eq(users.id, watchers.userId))
        .where(eq(watchers.taskId, taskId)),
      db
        .select({
          id: submissions.id,
          kind: submissions.kind,
          status: submissions.status,
          note: submissions.note,
          progressPercent: submissions.progressPercent,
          hoursSpent: submissions.hoursSpent,
          createdAt: submissions.createdAt,
          submittedById: submissions.submittedById,
          submitterName: users.name,
        })
        .from(submissions)
        .innerJoin(users, eq(users.id, submissions.submittedById))
        .where(eq(submissions.taskId, taskId))
        .orderBy(desc(submissions.createdAt)),
      db
        .select({ id: labels.id, name: labels.name, color: labels.color })
        .from(taskLabels)
        .innerJoin(labels, eq(labels.id, taskLabels.labelId))
        .where(eq(taskLabels.taskId, taskId)),
    ]);

    const approvers = approval
      ? await db
          .select({ userId: taskApprovers.userId, name: users.name, image: users.image })
          .from(taskApprovers)
          .innerJoin(users, eq(users.id, taskApprovers.userId))
          .where(eq(taskApprovers.taskId, taskId))
          .orderBy(asc(taskApprovers.sortOrder))
      : [];

    return {
      ...task,
      labels: labelRows,
      dependencies: links,
      checklist,
      comments: commentRows,
      workLogs: logs,
      watchers: watcherRows,
      submissions: submissionRows,
      approvalConfig: approval
        ? {
            requiredApprovals: approval.requiredApprovals,
            approvalMode: approval.approvalMode,
            approvers,
          }
        : null,
    };
  },

  async create(
    db: Database,
    projectId: string,
    input: {
      name: string;
      description?: string | null;
      status?: TaskStatus;
      priority?: TaskPriority;
      durationDays?: number;
      estimatedHours?: number | null;
      plannedStartDate?: string | null;
      plannedEndDate?: string | null;
      assignedToId?: string | null;
      reviewerId?: string | null;
      departmentId?: string | null;
      milestoneId?: string | null;
      labelIds?: string[];
      dependsOn?: { taskId: string; type?: "fs" | "ss" | "ff" | "sf"; lagDays?: number }[];
    },
    actorId: string,
  ) {
    // An assignee must be able to see the work being given to them.
    if (input.assignedToId) await TaskService.assertProjectMember(db, projectId, input.assignedToId);
    if (input.reviewerId) await TaskService.assertProjectMember(db, projectId, input.reviewerId);

    const code = await nextTaskCode(db, projectId);

    const created = await db.transaction(async (tx) => {
      const [task] = await tx
        .insert(tasks)
        .values({
          projectId,
          code,
          name: input.name,
          description: input.description ?? null,
          status: input.status ?? "not_started",
          priority: input.priority ?? "medium",
          durationDays: input.durationDays ?? 1,
          estimatedHours: input.estimatedHours != null ? String(input.estimatedHours) : null,
          plannedStartDate: input.plannedStartDate ?? null,
          plannedEndDate: input.plannedEndDate ?? null,
          assignedToId: input.assignedToId ?? null,
          reviewerId: input.reviewerId ?? null,
          departmentId: input.departmentId ?? null,
          milestoneId: input.milestoneId ?? null,
        })
        .returning();

      if (!task) throw errors.rule("CREATE_FAILED", "The task could not be created");

      if (input.labelIds && input.labelIds.length > 0) {
        await tx
          .insert(taskLabels)
          .values(input.labelIds.map((labelId) => ({ taskId: task.id, labelId })))
          .onConflictDoNothing();
      }

      if (input.dependsOn && input.dependsOn.length > 0) {
        await tx
          .insert(taskDependencies)
          .values(
            input.dependsOn.map((dependency) => ({
              projectId,
              predecessorId: dependency.taskId,
              successorId: task.id,
              type: dependency.type ?? "fs",
              lagDays: dependency.lagDays ?? 0,
            })),
          )
          .onConflictDoNothing();
      }

      return task;
    });

    await recordActivity(db, {
      projectId,
      actorId,
      entityType: "task",
      entityId: created.id,
      action: "created",
      summary: `created task ${created.code} ${created.name}`,
    });

    if (input.assignedToId && input.assignedToId !== actorId) {
      await notify(db, {
        userIds: [input.assignedToId],
        kind: "assignment",
        title: `You were assigned ${created.code}`,
        body: created.name,
        href: `/projects/${projectId}/tasks/${created.id}`,
        projectId,
        email: {
          subject: `${created.code} ${created.name} was assigned to you`,
          bodyText: `A task was assigned to you in Zero Task.\n\n${created.code} ${created.name}\n\nOpen it: /projects/${projectId}/tasks/${created.id}`,
          dedupeKey: `task-assigned:${created.id}:${input.assignedToId}`,
        },
      });
    }

    return TaskService.byId(db, created.id);
  },

  /**
   * Updating a task recomputes nothing here. The scheduler owns derived dates,
   * and the route calls it after a change that can move them. Splitting the two
   * keeps this function usable inside another transaction.
   */
  async update(
    db: Database,
    taskId: string,
    input: Record<string, unknown> & { assignedToId?: string | null; reviewerId?: string | null },
    actorId: string,
  ) {
    const current = await TaskService.byId(db, taskId);
    if (Object.keys(input).length === 0) throw errors.invalid("Nothing to update");

    if (input.assignedToId) await TaskService.assertProjectMember(db, current.projectId, input.assignedToId);
    if (input.reviewerId) await TaskService.assertProjectMember(db, current.projectId, input.reviewerId);

    if (input.status === "completed") {
      throw errors.rule(
        "COMPLETION_NEEDS_REVIEW",
        "Tasks are completed through a submission, not by editing the status",
      );
    }

    const patch = { ...input } as Record<string, unknown>;

    // Progress and status are two views of one fact, so each keeps the other
    // honest rather than letting a task read 100% while still in progress.
    if (input.progressPercent === 100 && !input.status) {
      patch.status = "pending_review";
    }
    if (input.actualStartDate && !input.status) {
      patch.status = "in_progress";
    }

    await db
      .update(tasks)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(tasks.id, taskId));

    await recordActivity(db, {
      projectId: current.projectId,
      actorId,
      entityType: "task",
      entityId: taskId,
      action: "updated",
      summary: `updated task ${current.code}`,
      detail: input,
    });

    if (input.assignedToId && input.assignedToId !== current.assigneeId && input.assignedToId !== actorId) {
      await notify(db, {
        userIds: [input.assignedToId],
        kind: "assignment",
        title: `You were assigned ${current.code}`,
        body: current.name,
        href: `/projects/${current.projectId}/tasks/${taskId}`,
        projectId: current.projectId,
      });
    }

    return TaskService.byId(db, taskId);
  },

  /** The board's drag-and-drop path: status only, with the side effects it needs. */
  async move(
    db: Database,
    taskId: string,
    status: "not_started" | "in_progress" | "blocked" | "cancelled",
    actorId: string,
  ) {
    const current = await TaskService.byId(db, taskId);

    if (current.status === "pending_review") {
      throw errors.rule(
        "AWAITING_REVIEW",
        "This task is waiting for review. A reviewer must decide the submission first.",
      );
    }

    const patch: Record<string, unknown> = { status, updatedAt: new Date() };

    if (status === "in_progress" && !current.actualStartDate) {
      patch.actualStartDate = new Date().toISOString().slice(0, 10);
    }
    if (status === "not_started") {
      patch.actualStartDate = null;
    }

    await db.update(tasks).set(patch).where(eq(tasks.id, taskId));

    await recordActivity(db, {
      projectId: current.projectId,
      actorId,
      entityType: "task",
      entityId: taskId,
      action: "status_changed",
      summary: `moved ${current.code} from ${current.status.replaceAll("_", " ")} to ${status.replaceAll("_", " ")}`,
      detail: { from: current.status, to: status },
    });

    // A blocked task is a fact its owner needs to hear about immediately.
    if (status === "blocked" && current.assigneeId && current.assigneeId !== actorId) {
      await notify(db, {
        userIds: [current.assigneeId],
        kind: "dependency",
        title: `${current.code} is blocked`,
        body: current.name,
        href: `/projects/${current.projectId}/tasks/${taskId}`,
        projectId: current.projectId,
      });
    }

    return TaskService.byId(db, taskId);
  },

  async remove(db: Database, taskId: string, actorId: string) {
    const current = await TaskService.byId(db, taskId);

    const [pending] = await db
      .select({ value: count() })
      .from(submissions)
      .where(and(eq(submissions.taskId, taskId), eq(submissions.status, "pending_review")));

    if ((pending?.value ?? 0) > 0) {
      throw errors.rule(
        "AWAITING_REVIEW",
        "This task has a submission under review. Decide it before deleting the task.",
      );
    }

    await db
      .update(tasks)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(tasks.id, taskId));

    await recordActivity(db, {
      projectId: current.projectId,
      actorId,
      entityType: "task",
      entityId: taskId,
      action: "deleted",
      summary: `deleted task ${current.code} ${current.name}`,
    });

    return { ok: true as const };
  },

  async dependencies(db: Database, taskId: string) {
    const [outgoing, incoming] = await Promise.all([
      db
        .select({
          id: taskDependencies.id,
          taskId: tasks.id,
          code: tasks.code,
          name: tasks.name,
          status: tasks.status,
          type: taskDependencies.type,
          lagDays: taskDependencies.lagDays,
        })
        .from(taskDependencies)
        .innerJoin(tasks, eq(tasks.id, taskDependencies.successorId))
        .where(eq(taskDependencies.predecessorId, taskId)),
      db
        .select({
          id: taskDependencies.id,
          taskId: tasks.id,
          code: tasks.code,
          name: tasks.name,
          status: tasks.status,
          type: taskDependencies.type,
          lagDays: taskDependencies.lagDays,
        })
        .from(taskDependencies)
        .innerJoin(tasks, eq(tasks.id, taskDependencies.predecessorId))
        .where(eq(taskDependencies.successorId, taskId)),
    ]);

    return {
      successors: outgoing.map((row) => ({ ...row, direction: "successor" as const })),
      predecessors: incoming.map((row) => ({ ...row, direction: "predecessor" as const })),
    };
  },

  /**
   * The graph must stay acyclic, and the only reliable way to know that is to
   * run the scheduler's own topological sort on the proposed edges. Checking
   * reachability by hand would duplicate that logic and eventually disagree
   * with it.
   */
  async addDependency(
    db: Database,
    projectId: string,
    input: {
      predecessorId: string;
      successorId: string;
      type?: "fs" | "ss" | "ff" | "sf";
      lagDays?: number;
    },
    actorId: string,
  ) {
    if (input.predecessorId === input.successorId) {
      throw errors.rule("SELF_DEPENDENCY", "A task cannot depend on itself");
    }

    const pair = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.projectId, projectId),
          inArray(tasks.id, [input.predecessorId, input.successorId]),
          isNull(tasks.deletedAt),
        ),
      );

    if (pair.length !== 2) throw errors.invalid("Both tasks must belong to this project");

    const [duplicate] = await db
      .select({ id: taskDependencies.id })
      .from(taskDependencies)
      .where(
        and(
          eq(taskDependencies.predecessorId, input.predecessorId),
          eq(taskDependencies.successorId, input.successorId),
        ),
      );

    if (duplicate) throw errors.conflict("These tasks are already linked");

    // Check the proposed edge against the graph as it would be afterwards.
    const { rows: graph, links: existing } = await TaskService.loadGraph(db, projectId);
    const proposed = [
      ...existing,
      {
        predecessorId: input.predecessorId,
        successorId: input.successorId,
        type: input.type ?? "fs",
        lagDays: input.lagDays ?? 0,
      },
    ];

    const cycle = findCycle(graph.map((row) => row.id), proposed);
    if (cycle) {
      throw errors.rule(
        "DEPENDENCY_CYCLE",
        `That link would create a loop: ${cycle.join(" -> ")}`,
      );
    }

    await db.insert(taskDependencies).values({
      projectId,
      predecessorId: input.predecessorId,
      successorId: input.successorId,
      type: input.type ?? "fs",
      lagDays: input.lagDays ?? 0,
    });

    await recordActivity(db, {
      projectId,
      actorId,
      entityType: "task",
      entityId: input.successorId,
      action: "dependency_added",
      summary: "linked two tasks",
    });

    return TaskService.byId(db, input.successorId);
  },

  async removeDependency(db: Database, dependencyId: string, actorId: string) {
    const [row] = await db
      .delete(taskDependencies)
      .where(eq(taskDependencies.id, dependencyId))
      .returning({
        projectId: taskDependencies.projectId,
        successorId: taskDependencies.successorId,
      });

    if (!row) throw errors.notFound("Dependency");

    await recordActivity(db, {
      projectId: row.projectId,
      actorId,
      entityType: "task",
      entityId: row.successorId,
      action: "dependency_removed",
      summary: "removed a task link",
    });

    return { ok: true as const };
  },

  /** Everything the scheduler needs for a project, in two queries. */
  async loadGraph(db: Database, projectId: string) {
    const [rows, links] = await Promise.all([
      db
        .select({
          id: tasks.id,
          code: tasks.code,
          durationDays: tasks.durationDays,
          status: tasks.status,
          progressPercent: tasks.progressPercent,
          plannedStartDate: tasks.plannedStartDate,
          plannedEndDate: tasks.plannedEndDate,
          actualStartDate: tasks.actualStartDate,
          actualEndDate: tasks.actualEndDate,
        })
        .from(tasks)
        .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt)))
        .orderBy(asc(tasks.code)),
      db
        .select({
          predecessorId: taskDependencies.predecessorId,
          successorId: taskDependencies.successorId,
          type: taskDependencies.type,
          lagDays: taskDependencies.lagDays,
        })
        .from(taskDependencies)
        .where(eq(taskDependencies.projectId, projectId)),
    ]);

    return { rows, links };
  },

  async assertProjectMember(db: Database, projectId: string, userId: string) {
    const [row] = await db
      .select({ userId: projectMembers.userId })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));

    if (!row) throw errors.invalid("That person is not a member of this project");
  },

  async setLabels(db: Database, taskId: string, labelIds: string[]) {
    const task = await TaskService.byId(db, taskId);

    if (labelIds.length > 0) {
      const valid = await db
        .select({ id: labels.id })
        .from(labels)
        .where(and(eq(labels.projectId, task.projectId), inArray(labels.id, labelIds)));

      if (valid.length !== labelIds.length) {
        throw errors.invalid("Some labels do not belong to this project");
      }
    }

    await db.transaction(async (tx) => {
      await tx.delete(taskLabels).where(eq(taskLabels.taskId, taskId));
      if (labelIds.length > 0) {
        await tx.insert(taskLabels).values(labelIds.map((labelId) => ({ taskId, labelId })));
      }
    });

    return TaskService.byId(db, taskId);
  },

  async logWork(
    db: Database,
    taskId: string,
    userId: string,
    input: { logDate: string; hours: number; note?: string | null },
  ) {
    const task = await TaskService.byId(db, taskId);

    if (input.logDate > new Date().toISOString().slice(0, 10)) {
      throw errors.invalid("You cannot log hours for a future day");
    }

    await db.insert(workLogs).values({
      taskId,
      userId,
      logDate: input.logDate,
      hours: String(input.hours),
      note: input.note ?? null,
    });

    return TaskService.detail(db, task.id);
  },

  async removeWorkLog(db: Database, taskId: string, logId: string, userId: string, isAdmin: boolean) {
    const [log] = await db
      .select({ userId: workLogs.userId })
      .from(workLogs)
      .where(and(eq(workLogs.id, logId), eq(workLogs.taskId, taskId)));

    if (!log) throw errors.notFound("Work log");
    if (log.userId !== userId && !isAdmin) {
      throw errors.forbidden("You can only remove your own work logs");
    }

    await db.delete(workLogs).where(eq(workLogs.id, logId));
    return { ok: true as const };
  },

  async addChecklistItem(db: Database, taskId: string, title: string) {
    const [row] = await db
      .select({ value: count() })
      .from(checklistItems)
      .where(eq(checklistItems.taskId, taskId));

    await db.insert(checklistItems).values({
      taskId,
      title,
      sortOrder: row?.value ?? 0,
    });

    return TaskService.detail(db, taskId);
  },

  async toggleChecklistItem(
    db: Database,
    taskId: string,
    itemId: string,
    done: boolean,
    userId: string,
  ) {
    const [row] = await db
      .update(checklistItems)
      .set({
        done,
        doneById: done ? userId : null,
        doneAt: done ? new Date() : null,
      })
      .where(and(eq(checklistItems.id, itemId), eq(checklistItems.taskId, taskId)))
      .returning({ id: checklistItems.id });

    if (!row) throw errors.notFound("Checklist item");
    return TaskService.detail(db, taskId);
  },

  async addComment(
    db: Database,
    taskId: string,
    authorId: string,
    input: { body: string; parentId?: string | null },
  ) {
    const task = await TaskService.byId(db, taskId);

    const [created] = await db
      .insert(comments)
      .values({ taskId, authorId, body: input.body, parentId: input.parentId ?? null })
      .returning({ id: comments.id });

    // Whoever owns the task should hear about a new comment, but not the person
    // who just wrote it.
    const audience = new Set<string>();
    if (task.assigneeId) audience.add(task.assigneeId);
    if (task.reviewerId) audience.add(task.reviewerId);
    audience.delete(authorId);

    if (audience.size > 0) {
      await notify(db, {
        userIds: [...audience],
        kind: "mention",
        title: `New comment on ${task.code}`,
        body: input.body.slice(0, 160),
        href: `/projects/${task.projectId}/tasks/${taskId}`,
        projectId: task.projectId,
      });
    }

    await recordActivity(db, {
      projectId: task.projectId,
      actorId: authorId,
      entityType: "task",
      entityId: taskId,
      action: "comment_added",
      summary: `commented on ${task.code}`,
    });

    return TaskService.detail(db, created ? taskId : taskId);
  },

  async removeComment(db: Database, taskId: string, commentId: string, userId: string, isAdmin: boolean) {
    const [row] = await db
      .select({ authorId: comments.authorId })
      .from(comments)
      .where(and(eq(comments.id, commentId), eq(comments.taskId, taskId)));

    if (!row) throw errors.notFound("Comment");
    if (row.authorId !== userId && !isAdmin) {
      throw errors.forbidden("You can only delete your own comments");
    }

    await db
      .update(comments)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(comments.id, commentId));

    return TaskService.detail(db, taskId);
  },

  async setApprovalConfig(
    db: Database,
    taskId: string,
    input: { requiredApprovals: number; approvalMode?: "any" | "all"; reviewerIds: string[] },
  ) {
    const task = await TaskService.byId(db, taskId);

    if (input.reviewerIds.length < input.requiredApprovals) {
      throw errors.invalid(
        "There must be at least as many reviewers as approvals required",
      );
    }

    for (const reviewerId of input.reviewerIds) {
      await TaskService.assertProjectMember(db, task.projectId, reviewerId);
    }

    await db.transaction(async (tx) => {
      await tx
        .insert(taskApprovalConfig)
        .values({
          taskId,
          requiredApprovals: input.requiredApprovals,
          approvalMode: input.approvalMode ?? "any",
        })
        .onConflictDoUpdate({
          target: taskApprovalConfig.taskId,
          set: {
            requiredApprovals: input.requiredApprovals,
            approvalMode: input.approvalMode ?? "any",
            updatedAt: new Date(),
          },
        });

      await tx.delete(taskApprovers).where(eq(taskApprovers.taskId, taskId));
      await tx.insert(taskApprovers).values(
        input.reviewerIds.map((userId, index) => ({ taskId, userId, sortOrder: index })),
      );
    });

    return TaskService.detail(db, taskId);
  },

  async addWatcher(db: Database, taskId: string, userId: string) {
    await db.insert(watchers).values({ taskId, userId }).onConflictDoNothing();
    return TaskService.detail(db, taskId);
  },

  async removeWatcher(db: Database, taskId: string, userId: string) {
    await db.delete(watchers).where(and(eq(watchers.taskId, taskId), eq(watchers.userId, userId)));
    return TaskService.detail(db, taskId);
  },

  /**
   * The "my week" payload: everything assigned, ordered by what is due first,
   * grouped by status on the client. Returning raw status counts as well lets the
   * board render its column headers before the cards arrive.
   */
  async myWeek(db: Database, userId: string, options: { from?: string; to?: string }) {
    const from = options.from ?? new Date().toISOString().slice(0, 10);
    const to =
      options.to ?? new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);

    const [items, statusCounts] = await Promise.all([
      db
        .select(taskColumns)
        .from(tasks)
        .innerJoin(projects, eq(projects.id, tasks.projectId))
        .leftJoin(users, eq(users.id, tasks.assignedToId))
        .leftJoin(departments, eq(departments.id, tasks.departmentId))
        .leftJoin(milestones, eq(milestones.id, tasks.milestoneId))
        .where(
          and(
            eq(tasks.assignedToId, userId),
            isNull(tasks.deletedAt),
            isNull(projects.deletedAt),
            sql`${tasks.status} in ${OPEN}`,
            lte(sql`coalesce(${tasks.plannedEndDate}, ${tasks.earlyFinish}, '9999-12-31'::date)`, to),
          ),
        )
        .orderBy(asc(sql`coalesce(${tasks.plannedEndDate}, '9999-12-31'::date)`))
        .limit(300),
      db
        .select({ status: tasks.status, value: count() })
        .from(tasks)
        .where(and(eq(tasks.assignedToId, userId), isNull(tasks.deletedAt)))
        .groupBy(tasks.status),
    ]);

    const withLabels = await TaskService.attachLabels(db, items);

    return {
      from,
      to,
      items: withLabels,
      statusCounts: Object.fromEntries(statusCounts.map((row) => [row.status, row.value])),
    };
  },

  /** Tasks waiting on the caller as a reviewer, which is a different queue from
   *  their own work and must not be mixed into it. */
  async reviewQueue(db: Database, userId: string) {
    const rows = await db
      .select({
        id: submissions.id,
        taskId: submissions.taskId,
        taskCode: tasks.code,
        taskName: tasks.name,
        projectId: submissions.projectId,
        projectName: projects.name,
        kind: submissions.kind,
        note: submissions.note,
        progressPercent: submissions.progressPercent,
        hoursSpent: submissions.hoursSpent,
        createdAt: submissions.createdAt,
        submitterName: users.name,
        submitterImage: users.image,
        requiredApprovals: submissions.requiredApprovals,
        approvalMode: submissions.approvalMode,
      })
      .from(submissions)
      .innerJoin(tasks, eq(tasks.id, submissions.taskId))
      .innerJoin(projects, eq(projects.id, submissions.projectId))
      .innerJoin(users, eq(users.id, submissions.submittedById))
      .where(
        and(
          eq(submissions.status, "pending_review"),
          sql`exists (
            select 1 from ${sql.identifier("submission_reviewers")}
            where ${cref("submission_reviewers", "submission_id")} = ${cref("submissions", "id")}
              and ${cref("submission_reviewers", "user_id")} = ${userId}
          )`,
        ),
      )
      .orderBy(asc(submissions.createdAt));

    return rows;
  },

  async upcoming(db: Database, userId: string, days: number) {
    const today = new Date().toISOString().slice(0, 10);
    const until = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

    return db
      .select(taskColumns)
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .leftJoin(users, eq(users.id, tasks.assignedToId))
      .leftJoin(departments, eq(departments.id, tasks.departmentId))
      .leftJoin(milestones, eq(milestones.id, tasks.milestoneId))
      .where(
        and(
          eq(tasks.assignedToId, userId),
          isNull(tasks.deletedAt),
          isNull(projects.deletedAt),
          sql`${tasks.status} in ${OPEN}`,
          gte(sql`coalesce(${tasks.plannedEndDate}, ${tasks.earlyFinish}, '9999-12-31'::date)`, today),
          lte(sql`coalesce(${tasks.plannedEndDate}, ${tasks.earlyFinish}, '9999-12-31'::date)`, until),
        ),
      )
      .orderBy(asc(sql`coalesce(${tasks.plannedEndDate}, '9999-12-31'::date)`))
      .limit(12);
  },
};

/** Depth-first search for a loop introduced by one proposed edge. */
function findCycle(
  taskIds: string[],
  edges: { predecessorId: string; successorId: string }[],
): string[] | null {
  const known = new Set(taskIds);
  const successors = new Map<string, string[]>();

  for (const id of taskIds) successors.set(id, []);
  for (const edge of edges) {
    if (!known.has(edge.predecessorId) || !known.has(edge.successorId)) continue;
    successors.get(edge.predecessorId)!.push(edge.successorId);
  }

  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];

  function visit(id: string): string[] | null {
    const current = state.get(id);
    if (current === "done") return null;
    if (current === "visiting") {
      const start = stack.indexOf(id);
      return [...stack.slice(start), id];
    }

    state.set(id, "visiting");
    stack.push(id);

    for (const next of successors.get(id) ?? []) {
      const found = visit(next);
      if (found) return found;
    }

    stack.pop();
    state.set(id, "done");
    return null;
  }

  for (const id of taskIds) {
    const found = visit(id);
    if (found) return found;
  }

  return null;
}

export { findCycle, projectAudience, recordActivity };

