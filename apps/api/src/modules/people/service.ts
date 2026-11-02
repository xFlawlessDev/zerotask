import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import type { Role } from "@zerotask/domain";
import type { Database } from "../../db/client.ts";
import { departments, projectMembers, tasks, users } from "../../db/schema/index.ts";
import { errors } from "../../lib/errors.ts";
import { cref } from "../../lib/sql.ts";

export interface PersonRow {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: Role;
  jobTitle: string | null;
  weeklyHours: number;
  departmentId: string | null;
  departmentName: string | null;
  departmentColor: string | null;
  createdAt: Date;
}

/**
 * One person shape used by every list and picker. Denormalizing the department
 * name onto it saves the UI from a second request just to render "Ops" beside a
 * name.
 */
const personColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  image: users.image,
  role: users.role,
  jobTitle: users.jobTitle,
  weeklyHours: users.weeklyHours,
  departmentId: users.departmentId,
  departmentName: departments.name,
  departmentColor: departments.color,
  createdAt: users.createdAt,
};

export const PeopleService = {
  async list(
    db: Database,
    options: {
      search?: string;
      departmentId?: string;
      role?: Role;
      limit?: number;
      offset?: number;
    },
  ) {
    const filters = [isNull(users.deletedAt)];

    if (options.search) {
      const pattern = `%${options.search}%`;
      filters.push(
        or(ilike(users.name, pattern), ilike(users.email, pattern), ilike(users.jobTitle, pattern))!,
      );
    }
    if (options.departmentId) filters.push(eq(users.departmentId, options.departmentId));
    if (options.role) filters.push(eq(users.role, options.role));

    const where = and(...filters);

    const [rows, [total]] = await Promise.all([
      db
        .select(personColumns)
        .from(users)
        .leftJoin(departments, eq(departments.id, users.departmentId))
        .where(where)
        .orderBy(asc(users.name))
        .limit(options.limit ?? 50)
        .offset(options.offset ?? 0),
      db.select({ value: count() }).from(users).where(where),
    ]);

    return { items: rows, total: total?.value ?? 0 };
  },

  /**
   * The picker query. Ordered so the most recently active colleagues come first:
   * an assignee list sorted alphabetically buries the two people you actually
   * work with.
   */
  async lookup(db: Database, options: { search?: string; limit?: number }) {
    const filters = [isNull(users.deletedAt)];
    if (options.search) {
      const pattern = `%${options.search}%`;
      filters.push(or(ilike(users.name, pattern), ilike(users.email, pattern))!);
    }

    const activeSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Correlated counts over `tasks` need explicit table names: Drizzle's bare
    // column rendering would bind `assigned_to_id` to `tasks` on both sides.
    const openTaskCount = sql<number>`(
      select count(*)::int from ${sql.identifier("tasks")}
      where ${cref("tasks", "assigned_to_id")} = ${cref("users", "id")}
        and ${cref("tasks", "deleted_at")} is null
        and ${cref("tasks", "status")} in ('not_started','in_progress','pending_review','blocked')
    )`;

    const recentlyActive = sql`exists (
      select 1 from ${sql.identifier("tasks")}
      where ${cref("tasks", "assigned_to_id")} = ${cref("users", "id")}
        and ${cref("tasks", "updated_at")} >= ${activeSince}
    )`;

    return db
      .select({
        ...personColumns,
        openTasks: openTaskCount,
        recentlyAssigned: recentlyActive,
      })
      .from(users)
      .leftJoin(departments, eq(departments.id, users.departmentId))
      .where(and(...filters))
      .orderBy(desc(recentlyActive), asc(users.name))
      .limit(options.limit ?? 20);
  },

  async byId(db: Database, id: string): Promise<PersonRow> {
    const [row] = await db
      .select(personColumns)
      .from(users)
      .leftJoin(departments, eq(departments.id, users.departmentId))
      .where(and(eq(users.id, id), isNull(users.deletedAt)));

    if (!row) throw errors.notFound("Person");
    return row;
  },

  async updateSelf(
    db: Database,
    id: string,
    input: {
      name?: string;
      jobTitle?: string | null;
      weeklyHours?: number;
      image?: string | null;
    },
  ) {
    if (Object.keys(input).length === 0) throw errors.invalid("Nothing to update");

    const [row] = await db
      .update(users)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning({ id: users.id });

    if (!row) throw errors.notFound("Person");
    return PeopleService.byId(db, id);
  },

  async updateByAdmin(
    db: Database,
    id: string,
    input: {
      name?: string;
      jobTitle?: string | null;
      weeklyHours?: number;
      role?: Role;
      departmentId?: string | null;
    },
  ) {
    if (Object.keys(input).length === 0) throw errors.invalid("Nothing to update");

    if (input.departmentId) {
      const [department] = await db
        .select({ id: departments.id })
        .from(departments)
        .where(eq(departments.id, input.departmentId));
      if (!department) throw errors.invalid("That department does not exist");
    }

    const [row] = await db
      .update(users)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning({ id: users.id });

    if (!row) throw errors.notFound("Person");
    return PeopleService.byId(db, id);
  },

  /**
   * Removing someone from the team is a soft delete plus an unassignment pass.
   * Their name must stay readable on the tasks and submissions they touched.
   */
  async remove(db: Database, id: string, actorId: string) {
    if (id === actorId) throw errors.rule("CANNOT_REMOVE_SELF", "You cannot remove your own account");

    const [row] = await db
      .update(users)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .returning({ id: users.id });

    if (!row) throw errors.notFound("Person");

    await db.delete(projectMembers).where(eq(projectMembers.userId, id));
    return { ok: true as const };
  },

  async listDepartments(db: Database) {
    const rows = await db
      .select({
        id: departments.id,
        code: departments.code,
        name: departments.name,
        description: departments.description,
        color: departments.color,
        dailyCapacityHours: departments.dailyCapacityHours,
        headcount: sql<number>`(
          select count(*)::int from ${sql.identifier("users")}
          where ${cref("users", "department_id")} = ${cref("departments", "id")}
            and ${cref("users", "deleted_at")} is null
        )`,
        openTasks: sql<number>`(
          select count(*)::int from ${sql.identifier("tasks")}
          where ${cref("tasks", "department_id")} = ${cref("departments", "id")}
            and ${cref("tasks", "deleted_at")} is null
            and ${cref("tasks", "status")} in ('not_started','in_progress','pending_review','blocked')
        )`,
      })
      .from(departments)
      .orderBy(asc(departments.name));

    return rows;
  },

  async createDepartment(
    db: Database,
    input: {
      code: string;
      name: string;
      description?: string | null;
      color?: string;
      dailyCapacityHours?: number;
    },
  ) {
    const [duplicate] = await db
      .select({ id: departments.id })
      .from(departments)
      .where(eq(departments.code, input.code));

    if (duplicate) throw errors.conflict(`Department code ${input.code} is already in use`);

    const [row] = await db.insert(departments).values(input).returning();
    return row!;
  },

  async updateDepartment(
    db: Database,
    id: string,
    input: {
      name?: string;
      description?: string | null;
      color?: string;
      dailyCapacityHours?: number;
    },
  ) {
    if (Object.keys(input).length === 0) throw errors.invalid("Nothing to update");

    const [row] = await db
      .update(departments)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(departments.id, id))
      .returning();

    if (!row) throw errors.notFound("Department");
    return row;
  },

  /**
   * Deleting a department is refused while people or tasks still point at it,
   * because the alternative is silently orphaning both.
   */
  async removeDepartment(db: Database, id: string) {
    const [headcount] = await db
      .select({ value: count() })
      .from(users)
      .where(and(eq(users.departmentId, id), isNull(users.deletedAt)));

    if ((headcount?.value ?? 0) > 0) {
      throw errors.rule(
        "DEPARTMENT_IN_USE",
        `${headcount!.value} people still belong to this department. Move them first.`,
      );
    }

    const [openWork] = await db
      .select({ value: count() })
      .from(tasks)
      .where(and(eq(tasks.departmentId, id), isNull(tasks.deletedAt)));

    if ((openWork?.value ?? 0) > 0) {
      throw errors.rule(
        "DEPARTMENT_IN_USE",
        `${openWork!.value} tasks still belong to this department. Reassign them first.`,
      );
    }

    const [row] = await db.delete(departments).where(eq(departments.id, id)).returning({
      id: departments.id,
    });

    if (!row) throw errors.notFound("Department");
    return { ok: true as const };
  },

  async byIds(db: Database, ids: string[]) {
    if (ids.length === 0) return [];
    return db
      .select(personColumns)
      .from(users)
      .leftJoin(departments, eq(departments.id, users.departmentId))
      .where(inArray(users.id, ids));
  },
};

