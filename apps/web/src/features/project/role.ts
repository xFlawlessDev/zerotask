import { projectRoleAtLeast } from "@zerotask/domain";
import type { ProjectRole } from "@zerotask/domain";
import type { Capabilities, ProjectDetail } from "@/lib/api/types";

/**
 * The project role the API will act on.
 *
 * The server treats an admin as an owner of every project (see `lib/guards.ts`):
 * admins are never locked out, though they are not implicitly members. The UI has
 * to derive the same answer, or it offers a control the server then refuses — the
 * exact drift that let a plain member click "Add milestone" and get a toast saying
 * they needed manager rights.
 *
 * One function, called by every project panel, so the pages cannot disagree with
 * each other either.
 */
export function effectiveProjectRole(
  project: Pick<ProjectDetail, "members">,
  personId: string,
  capabilities: Pick<Capabilities, "role">,
): ProjectRole | null {
  if (capabilities.role === "admin") return "owner";
  return project.members.find((member) => member.userId === personId)?.role ?? null;
}

/** May change the plan: dates, milestones, membership, project settings. */
export function canManageProject(role: ProjectRole | null): boolean {
  return projectRoleAtLeast(role, "manager");
}

/** May change the task list and move work, short of plan changes. */
export function canEditProject(role: ProjectRole | null): boolean {
  return projectRoleAtLeast(role, "member");
}
