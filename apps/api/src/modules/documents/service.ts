import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "../../db/client.ts";
import {
  documents,
  projects,
  submissionDocuments,
  tasks,
  users,
} from "../../db/schema/index.ts";
import { errors } from "../../lib/errors.ts";
import { recordActivity } from "../../lib/events.ts";
import { projectStanding } from "../../lib/membership.ts";
import { Storage } from "./storage.ts";

export const DocumentService = {
  async list(
    db: Database,
    scope:
      | { kind: "project"; projectId: string }
      | { kind: "person"; userId: string }
      | { kind: "all" },
    options: { search?: string; kind?: string; limit?: number; offset?: number },
  ) {
    const filters = [isNull(documents.deletedAt)];

    if (scope.kind === "project") filters.push(eq(documents.projectId, scope.projectId));
    if (scope.kind === "person") filters.push(eq(documents.uploadedById, scope.userId));

    if (options.search) {
      const pattern = `%${options.search}%`;
      filters.push(sql`(${documents.name} ilike ${pattern} or ${documents.code} ilike ${pattern})`);
    }
    if (options.kind) filters.push(sql`${documents.kind} = ${options.kind}`);

    const where = and(...filters);

    const [items, [total]] = await Promise.all([
      db
        .select({
          id: documents.id,
          code: documents.code,
          name: documents.name,
          kind: documents.kind,
          version: documents.version,
          note: documents.note,
          storageKey: documents.storageKey,
          mimeType: documents.mimeType,
          sizeBytes: documents.sizeBytes,
          createdAt: documents.createdAt,
          projectId: documents.projectId,
          projectName: projects.name,
          taskId: documents.taskId,
          taskCode: tasks.code,
          uploadedById: documents.uploadedById,
          uploadedByName: users.name,
        })
        .from(documents)
        .leftJoin(projects, eq(projects.id, documents.projectId))
        .leftJoin(tasks, eq(tasks.id, documents.taskId))
        .innerJoin(users, eq(users.id, documents.uploadedById))
        .where(where)
        .orderBy(desc(documents.createdAt))
        .limit(options.limit ?? 50)
        .offset(options.offset ?? 0),
      db.select({ value: count() }).from(documents).where(where),
    ]);

    return { items, total: total?.value ?? 0 };
  },

  /**
   * The repository code (`DOC-014`) is sequential per deployment. It exists so
   * people can refer to a document in conversation without pasting a UUID.
   */
  async create(
    db: Database,
    input: {
      projectId?: string | null;
      taskId?: string | null;
      name: string;
      kind?: string;
      note?: string | null;
    },
    file: File | null,
    uploader: { id: string; role: string },
  ) {
    /**
     * The same rule the guard applies: an admin may attach to any project because
     * an admin may open any project. Re-deriving membership here by hand is what
     * told an admin "You are not a member of this project" for a project the picker
     * had just offered them.
     */
    if (input.projectId) {
      const standing = await projectStanding(db, input.projectId, uploader);
      if (!standing) throw errors.forbidden("You are not a member of this project");
    }

    // A task only means something inside the project it belongs to. Without this
    // check a document could name one project and point its task at another, which
    // no screen can render correctly afterwards.
    if (input.taskId) {
      const [task] = await db
        .select({ projectId: tasks.projectId })
        .from(tasks)
        .where(and(eq(tasks.id, input.taskId), isNull(tasks.deletedAt)));

      if (!task) throw errors.notFound("Task");
      if (input.projectId && task.projectId !== input.projectId) {
        throw errors.invalid("That task belongs to a different project");
      }
    }

    const uploaderId = uploader.id;

    const stored = file ? await Storage.put(file) : null;

    const [row] = await db
      .select({ value: count() })
      .from(documents);

    const code = `DOC-${String((row?.value ?? 0) + 1).padStart(3, "0")}`;

    const [created] = await db
      .insert(documents)
      .values({
        projectId: input.projectId ?? null,
        taskId: input.taskId ?? null,
        code,
        name: input.name,
        kind: input.kind ?? "other",
        note: input.note ?? null,
        storageKey: stored?.storageKey ?? null,
        mimeType: stored?.mimeType ?? null,
        sizeBytes: stored?.sizeBytes ?? null,
        uploadedById: uploaderId,
      })
      .returning();

    if (!created) throw errors.rule("CREATE_FAILED", "The document could not be stored");

    if (input.projectId) {
      await recordActivity(db, {
        projectId: input.projectId,
        actorId: uploaderId,
        entityType: "document",
        entityId: created.id,
        action: "document_uploaded",
        summary: `uploaded ${created.code} ${created.name}`,
      });
    }

    return created;
  },

  async remove(db: Database, documentId: string, actorId: string) {
    const [row] = await db
      .select({
        id: documents.id,
        storageKey: documents.storageKey,
        uploadedById: documents.uploadedById,
        projectId: documents.projectId,
      })
      .from(documents)
      .where(and(eq(documents.id, documentId), isNull(documents.deletedAt)));

    if (!row) throw errors.notFound("Document");
    if (row.uploadedById !== actorId) {
      const [admin] = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, actorId));
      if (admin?.role !== "admin") {
        throw errors.forbidden("Only the uploader or an admin can delete this document");
      }
    }

    await db
      .update(documents)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(documents.id, documentId));

    if (row.storageKey) await Storage.remove(row.storageKey);

    return { ok: true as const };
  },

  async download(db: Database, documentId: string) {
    const [row] = await db
      .select({
        name: documents.name,
        storageKey: documents.storageKey,
        mimeType: documents.mimeType,
      })
      .from(documents)
      .where(and(eq(documents.id, documentId), isNull(documents.deletedAt)));

    if (!row) throw errors.notFound("Document");
    if (!row.storageKey) throw errors.notFound("File");

    const file = await Storage.get(row.storageKey);
    return { file, name: row.name, mimeType: row.mimeType ?? "application/octet-stream" };
  },

  /** Documents attached to a task, including those attached via a submission. */
  async forTask(db: Database, taskId: string) {
    const direct = await db
      .select({
        id: documents.id,
        code: documents.code,
        name: documents.name,
        kind: documents.kind,
        mimeType: documents.mimeType,
        sizeBytes: documents.sizeBytes,
        createdAt: documents.createdAt,
        uploadedByName: users.name,
      })
      .from(documents)
      .innerJoin(users, eq(users.id, documents.uploadedById))
      .where(and(eq(documents.taskId, taskId), isNull(documents.deletedAt)));

    return direct;
  },

  async attachToSubmission(db: Database, submissionId: string, documentIds: string[]) {
    if (documentIds.length === 0) return;
    await db
      .insert(submissionDocuments)
      .values(documentIds.map((documentId) => ({ submissionId, documentId })))
      .onConflictDoNothing();
  },

  async byIds(db: Database, ids: string[]) {
    if (ids.length === 0) return [];
    return db
      .select({ id: documents.id, name: documents.name, code: documents.code })
      .from(documents)
      .where(inArray(documents.id, ids));
  },
};
