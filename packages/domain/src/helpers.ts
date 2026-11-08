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

/**
 * The window the Resources page reports on, as a trailing range that ends today.
 *
 * It looks backwards on purpose: utilisation is a statement about what people
 * actually did, and logged hours are written for days that have already happened.
 * A window running forward from today is always empty, which reads as "nobody
 * worked" instead of "you are asking about the future".
 */
export function workloadWindow(days: number, today: string): { from: string; to: string } {
  const end = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(end)) return { from: today, to: today };

  const start = end - (Math.max(1, days) - 1) * 86_400_000;
  return { from: new Date(start).toISOString().slice(0, 10), to: today.slice(0, 10) };
}

/** Weekdays inside an inclusive ISO range, which is the capacity a window holds. */
export function countWeekdays(from: string, to: string): number {
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

/**
 * "1 project", "2 projects". Counts are read aloud and skimmed, and "1 active
 * projects" reads as a bug even when the number is right. The plural is explicit
 * for the words English does not form with a trailing `s` (person/people).
 */
export function plural(count: number, singular: string, pluralForm?: string): string {
  return count === 1 ? singular : (pluralForm ?? `${singular}s`);
}

/** A count with its noun, already agreed: "1 active project", "3 tasks". */
export function countLabel(count: number, singular: string, pluralForm?: string): string {
  return `${count} ${plural(count, singular, pluralForm)}`;
}
