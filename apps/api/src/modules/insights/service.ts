import { and, count, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import type { Role } from "@zerotask/domain";
import type { Database } from "../../db/client.ts";
import {
  departments,
  projectMembers,
  projects,
  submissions,
  tasks,
  users,
  workLogs,
} from "../../db/schema/index.ts";
import { cref } from "../../lib/sql.ts";

const OPEN = sql`('not_started','in_progress','pending_review','blocked')`;

export interface Overview {
  projects: { active: number; atRisk: number; completed: number };
  tasks: {
    open: number;
    inProgress: number;
    awaitingReview: number;
    blocked: number;
    overdue: number;
    completedThisWeek: number;
  };
  myTasks: { dueToday: number; dueThisWeek: number; overdue: number };
  reviews: { pendingForMe: number };
}

/**
 * The dashboard's numbers, computed in one pass. Every figure here has a
 * definition the UI states in its label ("due in 7 days", "blocked"), because a
 * count whose definition is guessed from the number is worse than no count.
 */
export async function overview(db: Database, viewer: { id: string; role: Role }): Promise<Overview> {
  const today = new Date().toISOString().slice(0, 10);
  const weekAhead = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

  // Non-admins only ever see figures over projects they can open.
  const visibleProjectIds =
    viewer.role === "admin"
      ? null
      : (
          await db
            .select({ projectId: projectMembers.projectId })
            .from(projectMembers)
            .where(eq(projectMembers.userId, viewer.id))
        ).map((row) => row.projectId);

  const projectScope =
    visibleProjectIds === null
      ? [isNull(projects.deletedAt)]
      : visibleProjectIds.length === 0
        ? [sql`false`]
        : [isNull(projects.deletedAt), inArray(projects.id, visibleProjectIds)];

  const taskScope = [isNull(tasks.deletedAt)];
  if (visibleProjectIds !== null) {
    if (visibleProjectIds.length === 0) taskScope.push(sql`false`);
    else taskScope.push(inArray(tasks.projectId, visibleProjectIds));
  }

  const [projectCounts, taskCounts, mine, reviewable] = await Promise.all([
    db
      .select({ status: projects.status, value: count() })
      .from(projects)
      .where(and(...projectScope))
      .groupBy(projects.status),
    db
      .select({
        open: sql<number>`count(*) filter (where ${tasks.status} in ${OPEN})::int`,
        inProgress: sql<number>`count(*) filter (where ${tasks.status} = 'in_progress')::int`,
        awaitingReview: sql<number>`count(*) filter (where ${tasks.status} = 'pending_review')::int`,
        blocked: sql<number>`count(*) filter (where ${tasks.status} = 'blocked')::int`,
        overdue: sql<number>`count(*) filter (
          where ${tasks.status} in ${OPEN}
            and coalesce(${tasks.plannedEndDate}, ${tasks.earlyFinish}) < ${today}
        )::int`,
        completedThisWeek: sql<number>`count(*) filter (
          where ${tasks.status} = 'completed' and ${tasks.actualEndDate} >= ${weekAgo}
        )::int`,
      })
      .from(tasks)
      .where(and(...taskScope)),
    db
      .select({
        dueToday: sql<number>`count(*) filter (
          where coalesce(${tasks.plannedEndDate}, ${tasks.earlyFinish}) = ${today}
        )::int`,
        dueThisWeek: sql<number>`count(*) filter (
          where coalesce(${tasks.plannedEndDate}, ${tasks.earlyFinish}) between ${today} and ${weekAhead}
        )::int`,
        overdue: sql<number>`count(*) filter (
          where coalesce(${tasks.plannedEndDate}, ${tasks.earlyFinish}) < ${today}
        )::int`,
      })
      .from(tasks)
      .where(
        and(eq(tasks.assignedToId, viewer.id), isNull(tasks.deletedAt), sql`${tasks.status} in ${OPEN}`),
      ),
    db
      .select({ value: count() })
      .from(submissions)
      .where(
        and(
          eq(submissions.status, "pending_review"),
          sql`exists (
            select 1 from ${sql.identifier("submission_reviewers")}
            where ${cref("submission_reviewers", "submission_id")} = ${cref("submissions", "id")}
              and ${cref("submission_reviewers", "user_id")} = ${viewer.id}
          )`,
        ),
      ),
  ]);

  const byStatus = new Map(projectCounts.map((row) => [row.status, row.value]));

  // "At risk" means a live project whose computed finish is past its target. That
  // is a real signal, unlike a green-to-red gradient on a card.
  const [atRisk] = await db
    .select({ value: count() })
    .from(projects)
    .where(
      and(
        ...projectScope,
        sql`${projects.baselinedEndDate} is not null`,
        sql`${projects.targetLaunchDate} is not null`,
        sql`${projects.baselinedEndDate} > ${projects.targetLaunchDate}`,
        sql`${projects.status} in ('active','on_hold')`,
      ),
    );

  const counts = taskCounts[0];
  const mineCounts = mine[0];

  return {
    projects: {
      active: byStatus.get("active") ?? 0,
      atRisk: atRisk?.value ?? 0,
      completed: byStatus.get("completed") ?? 0,
    },
    tasks: {
      open: counts?.open ?? 0,
      inProgress: counts?.inProgress ?? 0,
      awaitingReview: counts?.awaitingReview ?? 0,
      blocked: counts?.blocked ?? 0,
      overdue: counts?.overdue ?? 0,
      completedThisWeek: counts?.completedThisWeek ?? 0,
    },
    myTasks: {
      dueToday: mineCounts?.dueToday ?? 0,
      dueThisWeek: mineCounts?.dueThisWeek ?? 0,
      overdue: mineCounts?.overdue ?? 0,
    },
    reviews: { pendingForMe: reviewable[0]?.value ?? 0 },
  };
}

/**
 * Workload across a window. Hours come from logged work, not from estimates:
 * logged hours are a fact, estimates are a wish.
 */
export async function workload(
  db: Database,
  options: { from: string; to: string; departmentId?: string },
) {
  const filters = [gte(workLogs.logDate, options.from), lte(workLogs.logDate, options.to)];
  if (options.departmentId) filters.push(eq(tasks.departmentId, options.departmentId));

  const [people, byDepartment] = await Promise.all([
    db
      .select({
        userId: users.id,
        name: users.name,
        image: users.image,
        weeklyHours: users.weeklyHours,
        departmentId: users.departmentId,
        departmentName: departments.name,
        loggedHours: sql<number>`coalesce(sum(${workLogs.hours})::float, 0)`,
        openTasks: sql<number>`count(distinct ${tasks.id})::int`,
      })
      .from(users)
      .leftJoin(departments, eq(departments.id, users.departmentId))
      .leftJoin(workLogs, and(eq(workLogs.userId, users.id), and(...filters)))
      .leftJoin(
        tasks,
        and(
          eq(tasks.id, workLogs.taskId),
          isNull(tasks.deletedAt),
        ),
      )
      .where(isNull(users.deletedAt))
      .groupBy(users.id, users.name, users.image, users.weeklyHours, users.departmentId, departments.name)
      .orderBy(desc(sql`coalesce(sum(${workLogs.hours})::float, 0)`)),

    db
      .select({
        departmentId: departments.id,
        name: departments.name,
        color: departments.color,
        headcount: sql<number>`count(distinct ${users.id})::int`,
        loggedHours: sql<number>`coalesce(sum(${workLogs.hours})::float, 0)`,
      })
      .from(departments)
      .leftJoin(users, and(eq(users.departmentId, departments.id), isNull(users.deletedAt)))
      .leftJoin(workLogs, and(eq(workLogs.userId, users.id), and(...filters)))
      .groupBy(departments.id, departments.name, departments.color)
      .orderBy(departments.name),
  ]);

  /**
   * Utilisation compares logged hours against the capacity the window actually
   * contains, counting weekdays only, so a two-week range is not judged against a
   * single week's hours.
   */
  const weekdays = countWeekdays(options.from, options.to);

  return {
    window: { from: options.from, to: options.to, weekdays },
    people: people.map((person) => ({
      ...person,
      /** A percentage of the capacity the window contains, capped at 200 to keep
       *  a data-entry mistake from flattening the chart. */
      utilisation:
        person.weeklyHours > 0 && weekdays > 0
          ? Math.min(200, Math.round((person.loggedHours / ((person.weeklyHours / 5) * weekdays)) * 100))
          : 0,
    })),
    departments: byDepartment.map((row) => ({
      ...row,
      utilisation:
        row.headcount > 0 && weekdays > 0
          ? Math.min(
              200,
              Math.round((row.loggedHours / (row.headcount * 8 * weekdays)) * 100),
            )
          : 0,
    })),
  };
}

function countWeekdays(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;

  let days = 0;
  for (let cursor = start; cursor <= end; cursor += 86_400_000) {
    const weekday = new Date(cursor).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days++;
  }
  return days;
}

/** Critical-path pressure across the visible projects, for the portfolio view. */
export async function portfolio(db: Database, viewer: { id: string; role: Role }) {
  const visible =
    viewer.role === "admin"
      ? null
      : (
          await db
            .select({ projectId: projectMembers.projectId })
            .from(projectMembers)
            .where(eq(projectMembers.userId, viewer.id))
        ).map((row) => row.projectId);

  const scope =
    visible === null
      ? [isNull(projects.deletedAt)]
      : visible.length === 0
        ? [sql`false`]
        : [isNull(projects.deletedAt), inArray(projects.id, visible)];

  const today = new Date().toISOString().slice(0, 10);

  return db
    .select({
      id: projects.id,
      code: projects.code,
      name: projects.name,
      status: projects.status,
      targetLaunchDate: projects.targetLaunchDate,
      baselinedEndDate: projects.baselinedEndDate,
      lastScheduledAt: projects.lastScheduledAt,
      taskCount: sql<number>`(
        select count(*)::int from ${sql.identifier("tasks")}
        where ${cref("tasks", "project_id")} = ${cref("projects", "id")}
          and ${cref("tasks", "deleted_at")} is null
      )`,
      criticalCount: sql<number>`(
        select count(*)::int from ${sql.identifier("tasks")}
        where ${cref("tasks", "project_id")} = ${cref("projects", "id")}
          and ${cref("tasks", "deleted_at")} is null
          and ${cref("tasks", "is_critical")} = true
          and ${cref("tasks", "status")} in ${OPEN}
      )`,
      blockedCount: sql<number>`(
        select count(*)::int from ${sql.identifier("tasks")}
        where ${cref("tasks", "project_id")} = ${cref("projects", "id")}
          and ${cref("tasks", "deleted_at")} is null
          and ${cref("tasks", "status")} = 'blocked'
      )`,
      overdueCount: sql<number>`(
        select count(*)::int from ${sql.identifier("tasks")}
        where ${cref("tasks", "project_id")} = ${cref("projects", "id")}
          and ${cref("tasks", "deleted_at")} is null
          and ${cref("tasks", "status")} in ${OPEN}
          and coalesce(${cref("tasks", "planned_end_date")}, ${cref("tasks", "early_finish")}) < ${today}
      )`,
      waitingReviews: sql<number>`(
        select count(*)::int from ${sql.identifier("submissions")}
        where ${cref("submissions", "project_id")} = ${cref("projects", "id")}
          and ${cref("submissions", "status")} = 'pending_review'
      )`,
    })
    .from(projects)
    .where(and(...scope))
    .orderBy(projects.name);
}
