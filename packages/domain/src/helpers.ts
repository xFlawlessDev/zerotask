import {
  DEPENDENCY_TYPES,
  PROJECT_ROLES,
  PROJECT_STATUSES,
  ROLES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type DependencyType,
  type ProjectRole,
  type ProjectStatus,
  type Role,
  type TaskPriority,
  type TaskStatus,
} from "./vocabulary.ts";

/**
 * Numeric rank so "at least a lead" is a comparison instead of a set lookup
 * that has to repeat every allowed role.
 */
const ROLE_RANK: Record<Role, number> = { staff: 0, lead: 1, manager: 2, admin: 3 };
const PROJECT_ROLE_RANK: Record<ProjectRole, number> = { viewer: 0, member: 1, manager: 2, owner: 3 };

export function roleAtLeast(role: Role | null | undefined, minimum: Role): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export function projectRoleAtLeast(
  role: ProjectRole | null | undefined,
  minimum: ProjectRole,
): boolean {
  if (!role) return false;
  return PROJECT_ROLE_RANK[role] >= PROJECT_ROLE_RANK[minimum];
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function isProjectRole(value: unknown): value is ProjectRole {
  return typeof value === "string" && (PROJECT_ROLES as readonly string[]).includes(value);
}

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return typeof value === "string" && (PROJECT_STATUSES as readonly string[]).includes(value);
}

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && (TASK_STATUSES as readonly string[]).includes(value);
}

export function isTaskPriority(value: unknown): value is TaskPriority {
  return typeof value === "string" && (TASK_PRIORITIES as readonly string[]).includes(value);
}

export function isDependencyType(value: unknown): value is DependencyType {
  return typeof value === "string" && (DEPENDENCY_TYPES as readonly string[]).includes(value);
}

/**
 * Status words as a person would say them. The API never returns these; the UI
 * does, so the same status cannot be called two different things on two screens.
 */
export const STATUS_LABEL: Record<TaskStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  pending_review: "In review",
  blocked: "Blocked",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: "Draft",
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  archived: "Archived",
};

export const ROLE_LABEL: Record<Role, string> = {
  staff: "Staff",
  lead: "Lead",
  manager: "Manager",
  admin: "Admin",
};

export const PROJECT_ROLE_LABEL: Record<ProjectRole, string> = {
  viewer: "Viewer",
  member: "Member",
  manager: "Manager",
  owner: "Owner",
};

/**
 * Dependency notation as planners write it: FS, FS+2, SS-1. Used in the task
 * table and the Gantt labels so a link reads the same in both places.
 */
export function formatDependency(type: DependencyType, lagDays: number): string {
  if (lagDays === 0) return type.toUpperCase();
  return `${type.toUpperCase()}${lagDays > 0 ? "+" : ""}${lagDays}`;
}

/** Statuses that still count as live work, used by workload and progress math. */
export const OPEN_TASK_STATUSES: readonly TaskStatus[] = [
  "not_started",
  "in_progress",
  "pending_review",
  "blocked",
];
