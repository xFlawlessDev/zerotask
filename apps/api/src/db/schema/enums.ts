import { pgEnum } from "drizzle-orm/pg-core";
import {
  DEPENDENCY_TYPES,
  DOCUMENT_KINDS,
  MILESTONE_STATUSES,
  NOTIFICATION_KINDS,
  PROJECT_ROLES,
  PROJECT_STATUSES,
  ROLES,
  SCHEDULE_CHANGE_SOURCES,
  SCHEDULE_REVISION_STATUSES,
  SUBMISSION_KINDS,
  SUBMISSION_STATUSES,
  TARGET_DATE_MODES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from "@zerotask/domain";

/**
 * Every enum value is sourced from @zerotask/domain, so the database, the
 * route validation, and the UI labels cannot drift apart. Drizzle needs the
 * literal tuple type, hence the spread rather than a plain array.
 */

export const roleEnum = pgEnum("role", ROLES);
export const projectRoleEnum = pgEnum("project_role", PROJECT_ROLES);
export const projectStatusEnum = pgEnum("project_status", PROJECT_STATUSES);
export const taskStatusEnum = pgEnum("task_status", TASK_STATUSES);
export const taskPriorityEnum = pgEnum("task_priority", TASK_PRIORITIES);
export const dependencyTypeEnum = pgEnum("dependency_type", DEPENDENCY_TYPES);
export const submissionKindEnum = pgEnum("submission_kind", SUBMISSION_KINDS);
export const submissionStatusEnum = pgEnum("submission_status", SUBMISSION_STATUSES);
export const milestoneStatusEnum = pgEnum("milestone_status", MILESTONE_STATUSES);
export const documentKindEnum = pgEnum("document_kind", DOCUMENT_KINDS);
export const revisionStatusEnum = pgEnum("revision_status", SCHEDULE_REVISION_STATUSES);
export const changeSourceEnum = pgEnum("change_source", SCHEDULE_CHANGE_SOURCES);
export const notificationKindEnum = pgEnum("notification_kind", NOTIFICATION_KINDS);
export const targetDateModeEnum = pgEnum("target_date_mode", TARGET_DATE_MODES);

export const decisionEnum = pgEnum("decision", ["approved", "rejected"]);
export const approvalModeEnum = pgEnum("approval_mode", ["any", "all"]);
export const scheduleBasisEnum = pgEnum("schedule_basis", ["planned", "forecast"]);
export const emailStatusEnum = pgEnum("email_status", [
  "pending",
  "sending",
  "sent",
  "failed",
  "cancelled",
]);
export const favoriteKindEnum = pgEnum("favorite_kind", ["project", "task", "document"]);
