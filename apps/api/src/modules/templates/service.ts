import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "../../db/client.ts";
import {
  projectMembers,
  projects,
  templateDependencies,
  templateTasks,
  templates,
  tasks,
  taskDependencies,
} from "../../db/schema/index.ts";
import { errors } from "../../lib/errors.ts";
import { nextProjectCode, nextTaskCode } from "../../lib/codes.ts";
import { recordActivity } from "../../lib/events.ts";
import { cref } from "../../lib/sql.ts";

export const TemplateService = {
  async list(db: Database) {
    return db
      .select({
        id: templates.id,
        code: templates.code,
        name: templates.name,
        description: templates.description,
        category: templates.category,
        createdAt: templates.createdAt,
        taskCount: sql<number>`(
          select count(*)::int from ${sql.identifier("template_tasks")}
          where ${cref("template_tasks", "template_id")} = ${cref("templates", "id")}
        )`,
        totalDurationDays: sql<number>`coalesce((
          select sum(${cref("template_tasks", "duration_days")})::int
          from ${sql.identifier("template_tasks")}
          where ${cref("template_tasks", "template_id")} = ${cref("templates", "id")}
        ), 0)`,
        /**
         * How many live projects came from this template. `projects` carries no
         * template column because a stamped project must survive the template being
         * deleted; the provenance is kept in its description instead.
         */
        usageCount: sql<number>`(
          select count(*)::int from ${sql.identifier("projects")}
          where ${cref("projects", "deleted_at")} is null
            and ${cref("projects", "description")} like '%template:' || ${cref("templates", "code")} || '%'
        )`,
      })
      .from(templates)
      .where(isNull(templates.deletedAt))
      .orderBy(asc(templates.name));
  },

  async detail(db: Database, templateId: string) {
    const [template] = await db
      .select()
      .from(templates)
      .where(and(eq(templates.id, templateId), isNull(templates.deletedAt)));

    if (!template) throw errors.notFound("Template");

    const [taskRows, dependencyRows] = await Promise.all([
      db
        .select()
        .from(templateTasks)
        .where(eq(templateTasks.templateId, templateId))
        .orderBy(asc(templateTasks.sortOrder), asc(templateTasks.code)),
      db
        .select()
        .from(templateDependencies)
        .where(eq(templateDependencies.templateId, templateId)),
    ]);

    return { ...template, tasks: taskRows, dependencies: dependencyRows };
  },

  async create(
    db: Database,
    input: {
      name: string;
      description?: string | null;
      category?: string;
      tasks?: {
        code: string;
        name: string;
        durationDays?: number;
        priority?: "low" | "medium" | "high" | "critical";
        estimatedHours?: number | null;
        description?: string | null;
      }[];
      dependencies?: { predecessorCode: string; successorCode: string; type?: string; lagDays?: number }[];
    },
    actorId: string,
  ) {
    const [existing] = await db.select({ value: count() }).from(templates);
    const code = `TPL-${String((existing?.value ?? 0) + 1).padStart(3, "0")}`;

    return db.transaction(async (tx) => {
      const [template] = await tx
        .insert(templates)
        .values({
          code,
          name: input.name,
          description: input.description ?? null,
          category: input.category ?? "general",
          createdById: actorId,
        })
        .returning();

      if (!template) throw errors.rule("CREATE_FAILED", "The template could not be created");

      if (input.tasks && input.tasks.length > 0) {
        await tx.insert(templateTasks).values(
          input.tasks.map((task, index) => ({
            templateId: template.id,
            code: task.code,
            name: task.name,
            description: task.description ?? null,
            durationDays: task.durationDays ?? 1,
            priority: task.priority ?? "medium",
            estimatedHours: task.estimatedHours ?? null,
            sortOrder: index,
          })),
        );

        // Dependencies are declared by code, which is what a person writing a
        // template actually knows, and resolved to ids here.
        if (input.dependencies && input.dependencies.length > 0) {
          const created = await tx
            .select({ id: templateTasks.id, code: templateTasks.code })
            .from(templateTasks)
            .where(eq(templateTasks.templateId, template.id));

          const byCode = new Map(created.map((row) => [row.code, row.id]));

          const rows = input.dependencies.flatMap((dependency) => {
            const predecessorId = byCode.get(dependency.predecessorCode);
            const successorId = byCode.get(dependency.successorCode);
            if (!predecessorId || !successorId) return [];
            return [
              {
                templateId: template.id,
                predecessorId,
                successorId,
                type: dependency.type ?? "fs",
                lagDays: dependency.lagDays ?? 0,
              },
            ];
          });

          if (rows.length > 0) await tx.insert(templateDependencies).values(rows);
        }
      }

      return TemplateService.detail(db, template.id);
    });
  },

  async remove(db: Database, templateId: string) {
    const [row] = await db
      .update(templates)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(templates.id, templateId), isNull(templates.deletedAt)))
      .returning({ id: templates.id });

    if (!row) throw errors.notFound("Template");
    return { ok: true as const };
  },

  /**
   * Stamping a template is one transaction: the project, its tasks, and its
   * dependencies appear together or not at all. Task ids are mapped from template
   * ids in memory, because the dependency edges need the new ids.
   */
  async instantiate(
    db: Database,
    templateId: string,
    input: { name: string; kickoffDate?: string | null; ownerId?: string },
    actorId: string,
  ) {
    const template = await TemplateService.detail(db, templateId);
    if (template.tasks.length === 0) {
      throw errors.rule("EMPTY_TEMPLATE", "This template has no tasks to stamp");
    }

    const ownerId = input.ownerId ?? actorId;
    const projectCode = await nextProjectCode(db);
    const kickoffDate = input.kickoffDate ?? new Date().toISOString().slice(0, 10);

    const project = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(projects)
        .values({
          code: projectCode,
          name: input.name,
          description: `${template.description ?? template.name}\n\ntemplate:${template.code}`,
          status: "active",
          ownerId,
          createdById: actorId,
          kickoffDate,
        })
        .returning();

      if (!created) throw errors.rule("CREATE_FAILED", "The project could not be created");

      await tx.insert(projectMembers).values(
        [...new Set([ownerId, actorId])].map((userId) => ({
          projectId: created.id,
          userId,
          role: (userId === ownerId ? "owner" : "manager") as "owner" | "manager",
        })),
      );

      const templateById = new Map(template.tasks.map((task) => [task.id, task]));

      const insertedTasks = await tx
        .insert(tasks)
        .values(
          template.tasks.map((task, index) => ({
            projectId: created.id,
            code: task.code,
            name: task.name,
            description: task.description,
            durationDays: task.durationDays,
            priority: task.priority,
            estimatedHours: task.estimatedHours != null ? String(task.estimatedHours) : null,
            sortOrder: index,
          })),
        )
        .returning({ id: tasks.id, code: tasks.code });

      const newIdByTemplateId = new Map<string, string>();
      for (const inserted of insertedTasks) {
        const source = template.tasks.find((task) => task.code === inserted.code);
        if (source) newIdByTemplateId.set(source.id, inserted.id);
      }
      void templateById;

      if (template.dependencies.length > 0) {
        const edges = template.dependencies.flatMap((dependency) => {
          const predecessorId = newIdByTemplateId.get(dependency.predecessorId);
          const successorId = newIdByTemplateId.get(dependency.successorId);
          if (!predecessorId || !successorId) return [];
          return [
            {
              projectId: created.id,
              predecessorId,
              successorId,
              type: (dependency.type as "fs" | "ss" | "ff" | "sf") ?? "fs",
              lagDays: dependency.lagDays,
            },
          ];
        });

        if (edges.length > 0) await tx.insert(taskDependencies).values(edges);
      }

      return created;
    });

    await recordActivity(db, {
      projectId: project.id,
      actorId,
      entityType: "project",
      entityId: project.id,
      action: "created",
      summary: `created ${project.name} from template ${template.code}`,
    });

    return { id: project.id, code: project.code, name: project.name };
  },

  /**
   * Saves an existing project as a template. Durations and edges carry over;
   * assignees and dates do not, because those belong to the instance, not to the
   * shape of the work.
   */
  async captureFromProject(
    db: Database,
    projectId: string,
    input: { name: string; category?: string },
    actorId: string,
  ) {
    const [project] = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project) throw errors.notFound("Project");

    const [taskRows, edgeRows] = await Promise.all([
      db
        .select({
          id: tasks.id,
          code: tasks.code,
          name: tasks.name,
          description: tasks.description,
          durationDays: tasks.durationDays,
          priority: tasks.priority,
          estimatedHours: tasks.estimatedHours,
          sortOrder: tasks.sortOrder,
        })
        .from(tasks)
        .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt)))
        .orderBy(asc(tasks.sortOrder), asc(tasks.code)),
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

    if (taskRows.length === 0) {
      throw errors.rule("NOTHING_TO_CAPTURE", "This project has no tasks to capture");
    }

    const codeById = new Map(taskRows.map((row) => [row.id, row.code]));

    return TemplateService.create(
      db,
      {
        name: input.name ?? project.name,
        category: input.category,
        tasks: taskRows.map((row) => ({
          code: row.code,
          name: row.name,
          description: row.description,
          durationDays: row.durationDays,
          priority: row.priority,
          estimatedHours: row.estimatedHours ? Number(row.estimatedHours) : null,
        })),
        dependencies: edgeRows.flatMap((edge) => {
          const predecessorCode = codeById.get(edge.predecessorId);
          const successorCode = codeById.get(edge.successorId);
          if (!predecessorCode || !successorCode) return [];
          return [
            {
              predecessorCode,
              successorCode,
              type: edge.type,
              lagDays: edge.lagDays,
            },
          ];
        }),
      },
      actorId,
    );
  },

  async byIds(db: Database, ids: string[]) {
    if (ids.length === 0) return [];
    return db
      .select({ id: templates.id, code: templates.code, name: templates.name })
      .from(templates)
      .where(inArray(templates.id, ids));
  },

  async nextTaskCodePlaceholder(db: Database, projectId: string) {
    return nextTaskCode(db, projectId);
  },
};

