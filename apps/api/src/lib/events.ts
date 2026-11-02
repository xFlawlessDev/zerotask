import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import {
  activityEvents,
  emailOutbox,
  notificationPreferences,
  notifications,
  projectMembers,
  users,
} from "../db/schema/index.ts";

export interface ActivityInput {
  projectId?: string | null;
  actorId: string;
  entityType: "project" | "task" | "submission" | "document" | "milestone" | "revision";
  entityId: string;
  action: string;
  summary: string;
  detail?: Record<string, unknown>;
}

export async function recordActivity(db: Database, input: ActivityInput): Promise<void> {
  await db.insert(activityEvents).values({
    projectId: input.projectId ?? null,
    actorId: input.actorId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    summary: input.summary,
    detail: input.detail,
  });
}

export interface NotifyInput {
  userIds: string[];
  kind: "assignment" | "review" | "schedule" | "dependency" | "mention" | "system";
  title: string;
  body?: string;
  href?: string;
  projectId?: string | null;
  /** Set to queue a matching email. Omit to keep the notice in-app only. */
  email?: { subject: string; bodyText: string; dedupeKey: string };
}

/**
 * Notifications are best effort. A failure here must never roll back the work
 * that triggered it, so the caller does not await anything that can throw on the
 * user's behalf: this function swallows and logs its own errors.
 */
export async function notify(db: Database, input: NotifyInput): Promise<void> {
  const recipients = [...new Set(input.userIds)].filter(Boolean);
  if (recipients.length === 0) return;

  try {
    await db.insert(notifications).values(
      recipients.map((userId) => ({
        userId,
        kind: input.kind,
        title: input.title,
        body: input.body,
        href: input.href,
        projectId: input.projectId ?? null,
      })),
    );

    if (!input.email) return;

    const active = await db
      .select({
        id: users.id,
        email: users.email,
        emailEnabled: notificationPreferences.emailEnabled,
      })
      .from(users)
      .leftJoin(notificationPreferences, eq(notificationPreferences.userId, users.id))
      .where(and(inArray(users.id, recipients), isNull(users.deletedAt)));

    const rows = active
      .filter((row) => row.emailEnabled !== false)
      .map((row) => ({
        userId: row.id,
        toEmail: row.email,
        subject: input.email!.subject,
        bodyText: input.email!.bodyText,
        dedupeKey: `${input.email!.dedupeKey}:${row.id}`,
      }));

    if (rows.length > 0) {
      // onConflictDoNothing: the same logical event retried must not send twice.
      await db.insert(emailOutbox).values(rows).onConflictDoNothing();
    }
  } catch (error) {
    console.error("[notify] failed", error);
  }
}

/** Everyone who can see a project, for broadcast notices. */
export async function projectAudience(
  db: Database,
  projectId: string,
  options?: { excludeUserId?: string },
): Promise<string[]> {
  const members = await db
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(eq(projectMembers.projectId, projectId));

  return members
    .map((member) => member.userId)
    .filter((id) => id !== options?.excludeUserId);
}
