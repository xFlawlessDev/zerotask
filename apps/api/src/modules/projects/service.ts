import { and, asc, count, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { Database } from "../../db/client.ts";
import {
  labels,
  milestones,
  projectMembers,
  projects,
  tasks,
  users,
} from "../../db/schema/index.ts";
import { errors } from "../../lib/errors.ts";
import { nextProjectCode } from "../../lib/codes.ts";
import { recordActivity } from "../../lib/events.ts";
import { cref } from "../../lib/sql.ts";

/** Live statuses, as a raw SQL list for use inside a subquery. */
const OPEN_STATUSES = sql`('not_started','in_progress','pending_review','blocked')`;

function openTaskCount(projectColumn: string): SQL<number> {
  return sql<number>`(
    select count(*)::int from ${sql.identifier("tasks")}
    where ${cref("tasks", "project_id")} = ${cref(projectColumn, "id")}
      and ${cref("tasks", "deleted_at")} is null
      and ${cref("tasks", "status")} in ${OPEN_STATUSES}
  )`;
}

function statusTaskCount(status: string): SQL<number> {
  return sql<number>`(
    select count(*)::int from ${sql.identifier("tasks")}
    where ${cref("tasks", "project_id")} = ${cref("projects", "id")}
      and ${cref("tasks", "deleted_at")} is null
      and ${cref("tasks", "status")} = ${status}
  )`;
}

/**
 * Every correlated subquery in this file writes its table and column names
 * explicitly. Drizzle's bare column rendering drops the table prefix, which makes
 * a correlation bind to the wrong table and quietly return zero.
 */
const summaryColumns = {
  id: projects.id,
  code: projects.code,
  name: projects.name,
  description: projects.description,
  status: projects.status,
  ownerId: projects.ownerId,
  ownerName: users.name,
  targetLaunchDate: projects.targetLaunchDate,
  kickoffDate: projects.kickoffDate,
  leadTimeDays: projects.leadTimeDays,
  baselinedEndDate: projects.baselinedEndDate,
  lastScheduledAt: projects.lastScheduledAt,
  createdAt: projects.createdAt,
  taskCount: sql<number>`(
    select count(*)::int from ${sql.identifier("tasks")}
    where ${cref("tasks", "project_id")} = ${cref("projects", "id")}
      and ${cref("tasks", "deleted_at")} is null
  )`,
  openTaskCount: openTaskCount("projects"),
  completedTaskCount: statusTaskCount("completed"),
  criticalTaskCount: sql<number>`(
    select count(*)::int from ${sql.identifier("tasks")}
    where ${cref("tasks", "project_id")} = ${cref("projects", "id")}
      and ${cref("tasks", "deleted_at")} is null
      and ${cref("tasks", "is_critical")} = true
      and ${cref("tasks", "status")} in ${OPEN_STATUSES}
  )`,
  /**
   * Weighted by duration rather than by task count: ten one-day tasks are not
   * half a project when the other task is a two-month build.
   */
  progressPercent: sql<number>`coalesce((
    select round(
      100.0 * sum(${cref("tasks", "progress_percent")}::numeric * ${cref("tasks", "duration_days")})
      / nullif(sum(${cref("tasks", "duration_days")}), 0)
    )::int
    from ${sql.identifier("tasks")}
    where ${cref("tasks", "project_id")} = ${cref("projects", "id")}
      and ${cref("tasks", "deleted_at")} is null
      and ${cref("tasks", "status")} <> 'cancelled'
  ), 0)`,
  memberCount: sql<number>`(
    select count(*)::int from ${sql.identifier("project_members")}
    where ${cref("project_members", "project_id")} = ${cref("projects", "id")}
  )`,
  nextMilestoneDate: sql<string | null>`(
    select min(${cref("milestones", "target_date")})::text from ${sql.identifier("milestones")}
    where ${cref("milestones", "project_id")} = ${cref("projects", "id")}
      and ${cref("milestones", "status")} <> 'completed'
  )`,
};

function deriveTargetLaunchDate(project: {
  kickoffDate: string | null;
  leadTimeDays: number | null;
  targetLaunchDate: string | null;
}): string | null {
  if (!project.kickoffDate || !project.leadTimeDays) return project.targetLaunchDate;
  const start = Date.parse(`${project.kickoffDate}T00:00:00Z`);
  if (Number.isNaN(start)) return project.targetLaunchDate;
  return new Date(start + project.leadTimeDays * 86_400_000).toISOString().slice(0, 10);
}

/** The caller's membership, as a raw existence test used by both list scopes. */
function memberOfProjects(viewerId: string): SQL {
  return sql`exists (
    select 1 from ${sql.identifier("project_members")}
    where ${cref("project_members", "project_id")} = ${cref("projects", "id")}
      and ${cref("project_members", "user_id")} = ${viewerId}
  )`;
}

export const ProjectService = {
  /**
   * Visibility is computed from membership in the query rather than filtered
   * afterwards, so "how many projects can I see" and "list them" cannot disagree.
   */
  async list(
    db: Database,
    viewer: { id: string; role: string },
    options: {
      status?: string;
      search?: string;
      scope?: "mine" | "all" | "archived";
      order?: "recent" | "name" | "launch";
      limit?: number;
      offset?: number;
    },
  ) {
    const filters = [];

    // Only an admin may browse projects they do not belong to; everyone else is
    // always scoped to their own membership, whatever they ask for.
    const scope = viewer.role === "admin" ? (options.scope ?? "all") : "mine";

    if (scope === "archived") {
      filters.push(sql`${projects.archivedAt} is not null`, isNull(projects.deletedAt));
    } else {
      filters.push(isNull(projects.archivedAt), isNull(projects.deletedAt));
    }

    if (scope === "mine") filters.push(memberOfProjects(viewer.id));

    if (options.status) filters.push(eq(projects.status, options.status as never));
    if (options.search) {
      const pattern = `%${options.search}%`;
      filters.push(sql`(${projects.name} ilike ${pattern} or ${projects.code} ilike ${pattern})`);
    }

    const where = and(...filters);

    const orderBy =
      options.order === "name"
        ? asc(projects.name)
        : options.order === "launch"
          ? asc(sql`coalesce(${projects.targetLaunchDate}, '9999-12-31'::date)`)
          : desc(projects.createdAt);

    const [items, [total]] = await Promise.all([
      db
        .select(summaryColumns)
        .from(projects)
        .leftJoin(users, eq(users.id, projects.ownerId))
        .where(where)
        .orderBy(orderBy)
        .limit(options.limit ?? 50)
        .offset(options.offset ?? 0),
      db.select({ value: count() }).from(projects).where(where),
    ]);

    return { items, total: total?.value ?? 0 };
  },

  async byId(db: Database, projectId: string) {
    const [row] = await db
      .select(summaryColumns)
      .from(projects)
      .leftJoin(users, eq(users.id, projects.ownerId))
      .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)));

    if (!row) throw errors.notFound("Project");
    return row;
  },

  /**
   * The project page needs the project, its people, its milestones, and its
   * labels together. Fetching them in parallel here is one round trip on the wire
   * instead of four.
   */
  async detail(db: Database, projectId: string) {
    const [summary, members, projectMilestones, projectLabels] = await Promise.all([
      ProjectService.byId(db, projectId),
      ProjectService.members(db, projectId),
      ProjectService.milestones(db, projectId),
      ProjectService.labels(db, projectId),
    ]);

    return { ...summary, members, milestones: projectMilestones, labels: projectLabels };
  },

  async create(
    db: Database,
    input: {
      name: string;
      description?: string | null;
      ownerId?: string;
      status?: string;
      targetLaunchDate?: string | null;
      kickoffDate?: string | null;
      leadTimeDays?: number | null;
    },
    actorId: string,
  ) {
    const ownerId = input.ownerId ?? actorId;
    const code = await nextProjectCode(db);

    const targetLaunchDate = deriveTargetLaunchDate({
      kickoffDate: input.kickoffDate ?? null,
      leadTimeDays: input.leadTimeDays ?? null,
      targetLaunchDate: input.targetLaunchDate ?? null,
    });

    const created = await db.transaction(async (tx) => {
      const [project] = await tx
        .insert(projects)
        .values({
          code,
          name: input.name,
          description: input.description ?? null,
          status: (input.status ?? "draft") as never,
          ownerId,
          createdById: actorId,
          targetLaunchDate,
          kickoffDate: input.kickoffDate ?? null,
          leadTimeDays: input.leadTimeDays ?? null,
        })
        .returning();

      if (!project) throw errors.rule("CREATE_FAILED", "The project could not be created");

      // The owner is always a member: a project its owner cannot open is a support
      // ticket waiting to happen.
      const memberIds = [...new Set([ownerId, actorId])];
      await tx.insert(projectMembers).values(
        memberIds.map((userId) => ({
          projectId: project.id,
          userId,
          role: (userId === ownerId ? "owner" : "manager") as "owner" | "manager",
        })),
      );

      return project;
    });

    await recordActivity(db, {
      projectId: created.id,
      actorId,
      entityType: "project",
      entityId: created.id,
      action: "created",
      summary: `created project ${created.name}`,
    });

    return ProjectService.byId(db, created.id);
  },

  async update(
    db: Database,
    projectId: string,
    input: {
      name?: string;
      description?: string | null;
      status?: string;
      targetLaunchDate?: string | null;
      kickoffDate?: string | null;
      leadTimeDays?: number | null;
    },
    actorId: string,
  ) {
    if (Object.keys(input).length === 0) throw errors.invalid("Nothing to update");

    const [current] = await db
      .select({
        kickoffDate: projects.kickoffDate,
        leadTimeDays: projects.leadTimeDays,
        targetLaunchDate: projects.targetLaunchDate,
        name: projects.name,
      })
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!current) throw errors.notFound("Project");

    const next = {
      kickoffDate: input.kickoffDate !== undefined ? input.kickoffDate : current.kickoffDate,
      leadTimeDays: input.leadTimeDays !== undefined ? input.leadTimeDays : current.leadTimeDays,
      targetLaunchDate:
        input.targetLaunchDate !== undefined ? input.targetLaunchDate : current.targetLaunchDate,
    };

    // Archiving stamps a date so the archived view can sort by it; leaving the
    // archive state clears it again.
    const archivedAt =
      input.status === "archived" ? new Date() : input.status ? null : undefined;

    const [row] = await db
      .update(projects)
      .set({
        ...(input as Record<string, never>),
        targetLaunchDate: deriveTargetLaunchDate(next),
        ...(archivedAt !== undefined ? { archivedAt } : {}),
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))
      .returning({ id: projects.id });

    if (!row) throw errors.notFound("Project");

    await recordActivity(db, {
      projectId,
      actorId,
      entityType: "project",
      entityId: projectId,
      action: "updated",
      summary:
        input.name && input.name !== current.name
          ? `renamed the project to ${input.name}`
          : "updated the project",
      detail: input as Record<string, unknown>,
    });

    return ProjectService.byId(db, projectId);
  },

  /**
   * Deletion is soft. A project carries task history, submissions, and documents
   * that people rely on for reporting long after the project is over.
   */
  async remove(db: Database, projectId: string, actorId: string) {
    const [row] = await db
      .update(projects)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
      .returning({ name: projects.name });

    if (!row) throw errors.notFound("Project");

    await recordActivity(db, {
      projectId,
      actorId,
      entityType: "project",
      entityId: projectId,
      action: "deleted",
      summary: `deleted project ${row.name}`,
    });

    return { ok: true as const };
  },

  async members(db: Database, projectId: string) {
    return db
      .select({
        userId: projectMembers.userId,
        role: projectMembers.role,
        name: users.name,
        email: users.email,
        image: users.image,
        jobTitle: users.jobTitle,
        departmentId: users.departmentId,
        joinedAt: projectMembers.createdAt,
        openTasks: sql<number>`(
          select count(*)::int from ${sql.identifier("tasks")}
          where ${cref("tasks", "project_id")} = ${cref("project_members", "project_id")}
            and ${cref("tasks", "assigned_to_id")} = ${cref("project_members", "user_id")}
            and ${cref("tasks", "deleted_at")} is null
            and ${cref("tasks", "status")} in ${OPEN_STATUSES}
        )`,
      })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(eq(projectMembers.projectId, projectId))
      .orderBy(asc(projectMembers.role), asc(users.name));
  },

  async addMember(
    db: Database,
    projectId: string,
    input: { userId: string; role?: "viewer" | "member" | "manager" | "owner" },
    actorId: string,
  ) {
    const [person] = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.id, input.userId), isNull(users.deletedAt)));

    if (!person) throw errors.invalid("That person does not exist");

    const [existing] = await db
      .select({ userId: projectMembers.userId })
      .from(projectMembers)
      .where(
        and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, input.userId)),
      );

    if (existing) throw errors.conflict("They are already on this project");

    await db
      .insert(projectMembers)
      .values({ projectId, userId: input.userId, role: input.role ?? "member" });

    await recordActivity(db, {
      projectId,
      actorId,
      entityType: "project",
      entityId: projectId,
      action: "member_added",
      summary: `added ${person.name ?? "a member"} to the project`,
    });

    return ProjectService.members(db, projectId);
  },

  async updateMember(
    db: Database,
    projectId: string,
    userId: string,
    role: "viewer" | "member" | "manager" | "owner",
    actorId: string,
  ) {
    const [project] = await db
      .select({ ownerId: projects.ownerId })
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project) throw errors.notFound("Project");
    if (project.ownerId === userId && role !== "owner") {
      throw errors.rule("OWNER_LOCKED", "Hand ownership to someone else before changing this role");
    }

    const [row] = await db
      .update(projectMembers)
      .set({ role })
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .returning({ userId: projectMembers.userId });

    if (!row) throw errors.notFound("Project member");

    await recordActivity(db, {
      projectId,
      actorId,
      entityType: "project",
      entityId: projectId,
      action: "member_role_changed",
      summary: `changed a member's project role to ${role}`,
    });

    return ProjectService.members(db, projectId);
  },

  async removeMember(db: Database, projectId: string, userId: string, actorId: string) {
    const [project] = await db
      .select({ ownerId: projects.ownerId })
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project) throw errors.notFound("Project");
    if (project.ownerId === userId) {
      throw errors.rule("OWNER_LOCKED", "The project owner cannot be removed from the project");
    }

    const [row] = await db
      .delete(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .returning({ userId: projectMembers.userId });

    if (!row) throw errors.notFound("Project member");

    // Their work stays, but it must not silently point at someone who has left.
    await db
      .update(tasks)
      .set({ assignedToId: null, updatedAt: new Date() })
      .where(
        and(eq(tasks.projectId, projectId), eq(tasks.assignedToId, userId), isNull(tasks.deletedAt)),
      );

    await recordActivity(db, {
      projectId,
      actorId,
      entityType: "project",
      entityId: projectId,
      action: "member_removed",
      summary: "removed a member from the project",
    });

    return { ok: true as const };
  },

  async milestones(db: Database, projectId: string) {
    return db
      .select({
        id: milestones.id,
        name: milestones.name,
        description: milestones.description,
        targetDate: milestones.targetDate,
        status: milestones.status,
        completedAt: milestones.completedAt,
        sortOrder: milestones.sortOrder,
        taskCount: sql<number>`(
          select count(*)::int from ${sql.identifier("tasks")}
          where ${cref("tasks", "milestone_id")} = ${cref("milestones", "id")}
            and ${cref("tasks", "deleted_at")} is null
        )`,
        completedTaskCount: sql<number>`(
          select count(*)::int from ${sql.identifier("tasks")}
          where ${cref("tasks", "milestone_id")} = ${cref("milestones", "id")}
            and ${cref("tasks", "deleted_at")} is null
            and ${cref("tasks", "status")} = 'completed'
        )`,
      })
      .from(milestones)
      .where(eq(milestones.projectId, projectId))
      .orderBy(asc(milestones.sortOrder), asc(milestones.targetDate));
  },

  async createMilestone(
    db: Database,
    projectId: string,
    input: { name: string; description?: string | null; targetDate?: string | null },
    actorId: string,
  ) {
    const [row] = await db
      .insert(milestones)
      .values({ ...input, projectId })
      .returning();

    await recordActivity(db, {
      projectId,
      actorId,
      entityType: "milestone",
      entityId: row!.id,
      action: "created",
      summary: `added milestone ${input.name}`,
    });

    return ProjectService.milestones(db, projectId);
  },

  async updateMilestone(
    db: Database,
    projectId: string,
    milestoneId: string,
    input: {
      name?: string;
      description?: string | null;
      targetDate?: string | null;
      status?: "not_started" | "in_progress" | "completed";
    },
  ) {
    if (Object.keys(input).length === 0) throw errors.invalid("Nothing to update");

    const [row] = await db
      .update(milestones)
      .set({
        ...input,
        completedAt: input.status === "completed" ? new Date() : input.status ? null : undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(milestones.id, milestoneId), eq(milestones.projectId, projectId)))
      .returning({ id: milestones.id });

    if (!row) throw errors.notFound("Milestone");
    return ProjectService.milestones(db, projectId);
  },

  async removeMilestone(db: Database, projectId: string, milestoneId: string) {
    const [row] = await db
      .delete(milestones)
      .where(and(eq(milestones.id, milestoneId), eq(milestones.projectId, projectId)))
      .returning({ id: milestones.id });

    if (!row) throw errors.notFound("Milestone");
    return ProjectService.milestones(db, projectId);
  },

  async labels(db: Database, projectId: string) {
    return db
      .select({
        id: labels.id,
        name: labels.name,
        color: labels.color,
        usageCount: sql<number>`(
          select count(*)::int from ${sql.identifier("task_labels")}
          where ${cref("task_labels", "label_id")} = ${cref("labels", "id")}
        )`,
      })
      .from(labels)
      .where(eq(labels.projectId, projectId))
      .orderBy(asc(labels.name));
  },

  async createLabel(db: Database, projectId: string, input: { name: string; color?: string }) {
    const [existing] = await db
      .select({ id: labels.id })
      .from(labels)
      .where(and(eq(labels.projectId, projectId), eq(labels.name, input.name)));

    if (existing) throw errors.conflict(`A label named ${input.name} already exists`);

    await db.insert(labels).values({ projectId, name: input.name, color: input.color ?? "#545B63" });
    return ProjectService.labels(db, projectId);
  },

  async removeLabel(db: Database, projectId: string, labelId: string) {
    const [row] = await db
      .delete(labels)
      .where(and(eq(labels.id, labelId), eq(labels.projectId, projectId)))
      .returning({ id: labels.id });

    if (!row) throw errors.notFound("Label");
    return ProjectService.labels(db, projectId);
  },

  /** Projects a person belongs to, for the rail and the pickers. */
  async forPerson(db: Database, userId: string) {
    return db
      .select({
        id: projects.id,
        code: projects.code,
        name: projects.name,
        status: projects.status,
      })
      .from(projects)
      .innerJoin(projectMembers, eq(projectMembers.projectId, projects.id))
      .where(
        and(
          eq(projectMembers.userId, userId),
          isNull(projects.deletedAt),
          isNull(projects.archivedAt),
        ),
      )
      .orderBy(asc(projects.name));
  },

  async assertMember(db: Database, projectId: string, userId: string) {
    const [row] = await db
      .select({ role: projectMembers.role })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));

    if (!row) throw errors.forbidden("You are not a member of this project");
    return row.role;
  },

  async memberIds(db: Database, projectId: string) {
    const rows = await db
      .select({ userId: projectMembers.userId })
      .from(projectMembers)
      .where(eq(projectMembers.projectId, projectId));
    return rows.map((row) => row.userId);
  },

  async byIds(db: Database, ids: string[]) {
    if (ids.length === 0) return [];
    return db
      .select({ id: projects.id, code: projects.code, name: projects.name })
      .from(projects)
      .where(inArray(projects.id, ids));
  },
};

export { deriveTargetLaunchDate };


