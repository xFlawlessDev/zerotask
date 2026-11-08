import { and, eq } from "drizzle-orm";
import type { ProjectRole } from "@zerotask/domain";
import type { Database } from "../db/client.ts";
import { projectMembers } from "../db/schema/index.ts";

/**
 * The standing a person has on a project, as the API enforces it.
 *
 * An admin is an owner of every project: never locked out, though not implicitly a
 * member (see `createGuards`). The guard macros and any route handler that has to
 * answer the same question without a path param both call this, so the two cannot
 * drift — the drift is what let an admin see a project in the upload picker and then
 * be told by the create route that they were not a member.
 *
 * `null` means no standing at all.
 */
export async function projectStanding(
  db: Database,
  projectId: string,
  viewer: { id: string; role: string },
): Promise<ProjectRole | null> {
  if (viewer.role === "admin") return "owner";

  const membership = await db.query.projectMembers.findFirst({
    where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, viewer.id)),
  });

  return membership?.role ?? null;
}
