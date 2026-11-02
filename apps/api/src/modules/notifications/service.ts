import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "../../db/client.ts";
import {
  activityEvents,
  favorites,
  notifications,
  notificationPreferences,
  projects,
  tasks,
  users,
} from "../../db/schema/index.ts";
import { errors } from "../../lib/errors.ts";

export const NotificationService = {
  async list(db: Database, userId: string, options: { limit?: number; unreadOnly?: boolean }) {
    const filters = [eq(notifications.userId, userId)];
    if (options.unreadOnly) filters.push(isNull(notifications.readAt));

    const [items, [unread]] = await Promise.all([
      db
        .select({
          id: notifications.id,
          kind: notifications.kind,
          title: notifications.title,
          body: notifications.body,
          href: notifications.href,
          projectId: notifications.projectId,
          readAt: notifications.readAt,
          createdAt: notifications.createdAt,
        })
        .from(notifications)
        .where(and(...filters))
        .orderBy(desc(notifications.createdAt))
        .limit(options.limit ?? 30),
      db
        .select({ value: count() })
        .from(notifications)
        .where(and(eq(notifications.userId, userId), isNull(notifications.readAt))),
    ]);

    return { items, unreadCount: unread?.value ?? 0 };
  },

  async markRead(db: Database, userId: string, ids: string[]) {
    if (ids.length === 0) return { ok: true as const, updated: 0 };

    const rows = await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, userId), inArray(notifications.id, ids)))
      .returning({ id: notifications.id });

    return { ok: true as const, updated: rows.length };
  },

  async markAllRead(db: Database, userId: string) {
    const rows = await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
      .returning({ id: notifications.id });

    return { ok: true as const, updated: rows.length };
  },

  async preferences(db: Database, userId: string) {
    const [row] = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId));

    // Defaults are returned rather than written: a person who never opened the
    // settings has no row, and creating one on read would make every GET a write.
    return (
      row ?? {
        userId,
        emailEnabled: true,
        assignmentEmail: true,
        reviewEmail: true,
        scheduleEmail: true,
      }
    );
  },

  async updatePreferences(
    db: Database,
    userId: string,
    input: {
      emailEnabled?: boolean;
      assignmentEmail?: boolean;
      reviewEmail?: boolean;
      scheduleEmail?: boolean;
    },
  ) {
    await db
      .insert(notificationPreferences)
      .values({ userId, ...input })
      .onConflictDoUpdate({
        target: notificationPreferences.userId,
        set: { ...input, updatedAt: new Date() },
      });

    return NotificationService.preferences(db, userId);
  },
};

export const ActivityService = {
  async forProject(db: Database, projectId: string, limit: number) {
    return db
      .select({
        id: activityEvents.id,
        entityType: activityEvents.entityType,
        entityId: activityEvents.entityId,
        action: activityEvents.action,
        summary: activityEvents.summary,
        detail: activityEvents.detail,
        createdAt: activityEvents.createdAt,
        actorId: activityEvents.actorId,
        actorName: users.name,
        actorImage: users.image,
      })
      .from(activityEvents)
      .innerJoin(users, eq(users.id, activityEvents.actorId))
      .where(eq(activityEvents.projectId, projectId))
      .orderBy(desc(activityEvents.createdAt))
      .limit(limit);
  },

  /** A person's own trail, across every project they touch. */
  async forPerson(db: Database, userId: string, limit: number) {
    return db
      .select({
        id: activityEvents.id,
        projectId: activityEvents.projectId,
        projectName: projects.name,
        entityType: activityEvents.entityType,
        action: activityEvents.action,
        summary: activityEvents.summary,
        createdAt: activityEvents.createdAt,
      })
      .from(activityEvents)
      .leftJoin(projects, eq(projects.id, activityEvents.projectId))
      .where(eq(activityEvents.actorId, userId))
      .orderBy(desc(activityEvents.createdAt))
      .limit(limit);
  },
};

export const FavoriteService = {
  async list(db: Database, userId: string) {
    return db
      .select({
        kind: favorites.kind,
        entityId: favorites.entityId,
        label: favorites.label,
        href: favorites.href,
        createdAt: favorites.createdAt,
      })
      .from(favorites)
      .where(eq(favorites.userId, userId))
      .orderBy(desc(favorites.createdAt));
  },

  async add(
    db: Database,
    userId: string,
    input: { kind: "project" | "task" | "document"; entityId: string },
  ) {
    // The label and href are resolved server side so a favorite cannot be a link
    // to something the person is not allowed to open.
    let label: string;
    let href: string;

    if (input.kind === "project") {
      const [row] = await db
        .select({ name: projects.name, code: projects.code })
        .from(projects)
        .where(and(eq(projects.id, input.entityId), isNull(projects.deletedAt)));
      if (!row) throw errors.notFound("Project");
      label = `${row.code} ${row.name}`;
      href = `/projects/${input.entityId}`;
    } else if (input.kind === "task") {
      const [row] = await db
        .select({ code: tasks.code, name: tasks.name, projectId: tasks.projectId })
        .from(tasks)
        .where(and(eq(tasks.id, input.entityId), isNull(tasks.deletedAt)));

      if (!row) throw errors.notFound("Task");
      label = `${row.code} ${row.name}`;
      href = `/projects/${row.projectId}/tasks/${input.entityId}`;
    } else {
      throw errors.invalid("Only projects and tasks can be pinned");
    }

    await db
      .insert(favorites)
      .values({ userId, kind: input.kind, entityId: input.entityId, label, href })
      .onConflictDoNothing();

    return FavoriteService.list(db, userId);
  },

  async remove(db: Database, userId: string, kind: string, entityId: string) {
    await db
      .delete(favorites)
      .where(
        and(
          eq(favorites.userId, userId),
          eq(favorites.kind, kind as "project" | "task" | "document"),
          eq(favorites.entityId, entityId),
        ),
      );

    return FavoriteService.list(db, userId);
  },
};

