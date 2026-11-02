/**
 * The vocabulary both apps must agree on: role names, statuses, and the order
 * they sort in. The API validates against these lists, the UI labels them.
 * Changing a value here changes it everywhere, which is the only way the two
 * sides stay in sync without a code generator.
 */

export const ROLES = ["staff", "lead", "manager", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const PROJECT_ROLES = ["viewer", "member", "manager", "owner"] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const PROJECT_STATUSES = ["draft", "active", "on_hold", "completed", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const TASK_STATUSES = [
  "not_started",
  "in_progress",
  "pending_review",
  "blocked",
  "completed",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const DEPENDENCY_TYPES = ["fs", "ss", "ff", "sf"] as const;
export type DependencyType = (typeof DEPENDENCY_TYPES)[number];

export const SUBMISSION_KINDS = ["progress", "completion", "handover"] as const;
export type SubmissionKind = (typeof SUBMISSION_KINDS)[number];

export const SUBMISSION_STATUSES = [
  "pending_review",
  "approved",
  "rejected",
  "revision_required",
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const MILESTONE_STATUSES = ["not_started", "in_progress", "completed"] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const DOCUMENT_KINDS = ["report", "photo", "spec", "drawing", "checklist", "other"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const SCHEDULE_REVISION_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "applied",
] as const;
export type ScheduleRevisionStatus = (typeof SCHEDULE_REVISION_STATUSES)[number];

export const SCHEDULE_CHANGE_SOURCES = ["internal", "client", "supplier"] as const;
export type ScheduleChangeSource = (typeof SCHEDULE_CHANGE_SOURCES)[number];

export const NOTIFICATION_KINDS = [
  "assignment",
  "review",
  "schedule",
  "dependency",
  "mention",
  "system",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const TARGET_DATE_MODES = ["manual", "lead_time"] as const;
export type TargetDateMode = (typeof TARGET_DATE_MODES)[number];
