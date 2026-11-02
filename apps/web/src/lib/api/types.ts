import type {
  DependencyType,
  DocumentKind,
  MilestoneStatus,
  ProjectRole,
  ProjectStatus,
  Role,
  SubmissionKind,
  SubmissionStatus,
  TaskPriority,
  TaskStatus,
} from "@zerotask/domain";

/**
 * The API's response shapes, written by hand on the frontend.
 *
 * Generated types from Eden were considered and rejected: the shapes here are
 * what the pages actually read, they are the same file the query hooks are typed
 * against, and a hand-written contract makes a server-side rename a compile error
 * in the UI rather than a runtime surprise.
 */

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface Person {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: Role;
  jobTitle: string | null;
  weeklyHours: number;
  departmentId: string | null;
  departmentName: string | null;
  departmentColor: string | null;
  createdAt: string;
}

export interface PersonLookup extends Person {
  openTasks: number;
  recentlyAssigned: boolean;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  description: string | null;
  color: string;
  dailyCapacityHours: number;
  headcount?: number;
  openTasks?: number;
}

export interface Capabilities {
  role: Role;
  managePeople: boolean;
  manageDepartments: boolean;
  manageTemplates: boolean;
  createProject: boolean;
  viewAllProjects: boolean;
}

export type SessionResponse =
  | { authenticated: false }
  | {
      authenticated: true;
      user: Person;
      capabilities: Capabilities;
      departments: Department[];
    };

export interface ProjectSummary {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  ownerId: string;
  ownerName: string | null;
  targetLaunchDate: string | null;
  kickoffDate: string | null;
  leadTimeDays: number | null;
  baselinedEndDate: string | null;
  lastScheduledAt: string | null;
  createdAt: string;
  taskCount: number;
  openTaskCount: number;
  completedTaskCount: number;
  criticalTaskCount: number;
  progressPercent: number;
  memberCount: number;
  nextMilestoneDate: string | null;
}

export interface ProjectMember {
  userId: string;
  role: ProjectRole;
  name: string | null;
  email: string;
  image: string | null;
  jobTitle: string | null;
  departmentId: string | null;
  departmentName: string | null;
  joinedAt: string;
  openTasks: number;
}

export interface Milestone {
  id: string;
  name: string;
  description: string | null;
  targetDate: string | null;
  status: MilestoneStatus;
  completedAt: string | null;
  sortOrder: number;
  taskCount: number;
  completedTaskCount: number;
}

export interface Label {
  id: string;
  name: string;
  color: string;
  usageCount: number;
}

export interface ProjectDetail extends ProjectSummary {
  members: ProjectMember[];
  milestones: Milestone[];
  labels: Label[];
}

export interface ProjectListItem extends ProjectSummary {}

export interface TaskLabelRef {
  id: string;
  name: string;
  color: string;
}

export interface Task {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  code: string;
  name: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  durationDays: number;
  estimatedHours: string | null;
  progressPercent: number;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  actualStartDate: string | null;
  actualEndDate: string | null;
  earlyStart: string | null;
  earlyFinish: string | null;
  lateStart: string | null;
  lateFinish: string | null;
  totalFloatDays: number | null;
  isCritical: boolean;
  sortOrder: number;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeImage: string | null;
  reviewerId: string | null;
  departmentId: string | null;
  departmentName: string | null;
  milestoneId: string | null;
  milestoneName: string | null;
  loggedHours: number;
  updatedAt: string;
  labels: TaskLabelRef[];
}

export interface DependencyLink {
  id: string;
  taskId: string;
  code: string;
  name: string;
  status: TaskStatus;
  type: DependencyType;
  lagDays: number;
  direction: "predecessor" | "successor";
}

export interface ChecklistItem {
  id: string;
  taskId: string;
  title: string;
  done: boolean;
  doneById: string | null;
  doneAt: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface TaskComment {
  id: string;
  body: string;
  parentId: string | null;
  createdAt: string;
  editedAt: string | null;
  authorId: string;
  authorName: string | null;
  authorImage: string | null;
}

export interface WorkLog {
  id: string;
  logDate: string;
  hours: string;
  note: string | null;
  userId: string;
  userName: string | null;
}

export interface Watcher {
  userId: string;
  name: string | null;
  email: string;
  image: string | null;
}

export interface ApprovalConfig {
  requiredApprovals: number;
  approvalMode: "any" | "all";
  approvers: { userId: string; name: string | null; image: string | null }[];
}

export interface SubmissionSummary {
  id: string;
  taskId: string;
  kind: SubmissionKind;
  status: SubmissionStatus;
  note: string | null;
  progressPercent: number | null;
  hoursSpent: string | null;
  createdAt: string;
  submittedById: string;
  submitterName: string | null;
}

export interface TaskDetail extends Task {
  dependencies: { predecessors: DependencyLink[]; successors: DependencyLink[] };
  checklist: ChecklistItem[];
  comments: TaskComment[];
  workLogs: WorkLog[];
  watchers: Watcher[];
  submissions: SubmissionSummary[];
  approvalConfig: ApprovalConfig | null;
}

export interface Submission {
  id: string;
  taskId: string;
  taskCode: string;
  taskName: string;
  kind: SubmissionKind;
  status: SubmissionStatus;
  note: string | null;
  progressPercent: number | null;
  hoursSpent: string | null;
  requiredApprovals: number;
  approvalMode: "any" | "all";
  createdAt: string;
  decidedAt: string | null;
  submittedById: string;
  submitterName: string | null;
  submitterImage: string | null;
  reviewers: {
    userId: string;
    name: string | null;
    image: string | null;
    decision: "approved" | "rejected" | null;
    decisionNote: string | null;
    decidedAt: string | null;
  }[];
  decisions: { submissionId: string; reviewerId: string; reviewerName: string | null; decision: string; note: string | null; createdAt: string }[];
  documents: { id: string; code: string; name: string; kind: DocumentKind; mimeType: string | null; sizeBytes: number | null }[];
  tally: {
    required: number;
    mode: "any" | "all";
    approved: number;
    rejected: number;
    decided: boolean;
    outcome: "approved" | "rejected" | null;
  };
}

export interface ReviewQueueItem {
  id: string;
  taskId: string;
  taskCode: string;
  taskName: string;
  projectId: string;
  projectName: string;
  kind: SubmissionKind;
  note: string | null;
  progressPercent: number | null;
  hoursSpent: string | null;
  createdAt: string;
  submitterName: string | null;
  submitterImage: string | null;
  requiredApprovals: number;
  approvalMode: "any" | "all";
}

export interface MyWork {
  from: string;
  to: string;
  items: Task[];
  statusCounts: Record<string, number>;
}

export interface ScheduleSummary {
  projectId: string;
  basis: "planned" | "forecast";
  projectStartDate: string | null;
  calculatedEndDate: string | null;
  projectDurationDays: number;
  criticalTaskIds: string[];
  criticalTaskCount: number;
  totalTaskCount: number;
  varianceDays: number | null;
  lastScheduledAt: string | null;
}

export interface TimelineBar {
  id: string;
  code: string;
  name: string;
  status: TaskStatus;
  progressPercent: number;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  earlyStart: string | null;
  earlyFinish: string | null;
  lateStart: string | null;
  lateFinish: string | null;
  totalFloatDays: number | null;
  isCritical: boolean;
  assigneeId: string | null;
  assigneeName: string | null;
  milestoneId: string | null;
  durationDays: number;
  start: string | null;
  end: string | null;
  float: number | null;
}

export interface Timeline {
  bars: TimelineBar[];
  links: { predecessorId: string; successorId: string; type: DependencyType; lagDays: number }[];
  range: { from: string; to: string } | null;
}

export interface HolidayComparison {
  baseline: ComparisonSchedule;
  withHolidays: ComparisonSchedule;
  holidays: { date: string; name: string; type: "national_holiday" | "joint_leave" }[];
  sources: { title: string; url: string }[];
  delayCalendarDays: number;
}

export interface ComparisonSchedule {
  projectStartDate: string;
  calculatedEndDate: string;
  projectDurationDays: number;
  tasks: { id: string; startDate: string; endDate: string; totalFloatDays: number; isCritical: boolean }[];
}

export interface ScheduleRevisionItem {
  revisionId: string;
  taskId: string;
  taskCode: string;
  taskName: string;
  oldStartDate: string | null;
  oldEndDate: string | null;
  newStartDate: string | null;
  newEndDate: string | null;
  shiftDays: number;
  note: string | null;
}

export interface ScheduleRevision {
  id: string;
  revisionNo: number;
  title: string;
  reason: string;
  source: "internal" | "client" | "supplier";
  status: "draft" | "submitted" | "approved" | "rejected" | "applied";
  baselineEndDate: string | null;
  proposedEndDate: string | null;
  deltaDays: number | null;
  criticalPathChanged: boolean;
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
  requestedById: string;
  requestedByName: string | null;
  items: ScheduleRevisionItem[];
}

export interface DocumentRecord {
  id: string;
  code: string;
  name: string;
  kind: DocumentKind;
  version: string;
  note: string | null;
  storageKey: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  projectId: string | null;
  projectName: string | null;
  taskId: string | null;
  taskCode: string | null;
  uploadedById: string;
  uploadedByName: string | null;
}

export interface TemplateSummary {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string;
  createdAt: string;
  taskCount: number;
  totalDurationDays: number;
  usageCount: number;
}

export interface TemplateDetail extends Omit<TemplateSummary, "taskCount" | "totalDurationDays" | "usageCount"> {
  tasks: {
    id: string;
    templateId: string;
    code: string;
    name: string;
    description: string | null;
    durationDays: number;
    priority: TaskPriority;
    estimatedHours: number | null;
    sortOrder: number;
  }[];
  dependencies: {
    id: string;
    templateId: string;
    predecessorId: string;
    successorId: string;
    type: DependencyType;
    lagDays: number;
  }[];
}

export interface Notification {
  id: string;
  kind: "assignment" | "review" | "schedule" | "dependency" | "mention" | "system";
  title: string;
  body: string | null;
  href: string | null;
  projectId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationFeed {
  items: Notification[];
  unreadCount: number;
}

export interface NotificationPreferences {
  userId: string;
  emailEnabled: boolean;
  assignmentEmail: boolean;
  reviewEmail: boolean;
  scheduleEmail: boolean;
}

export interface ActivityEvent {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  summary: string;
  detail: Record<string, unknown> | null;
  createdAt: string;
  actorId: string;
  actorName: string | null;
  actorImage: string | null;
}

export interface Favorite {
  kind: "project" | "task" | "document";
  entityId: string;
  label: string;
  href: string;
  createdAt: string;
}

export interface Overview {
  projects: { active: number; atRisk: number; completed: number };
  tasks: {
    open: number;
    inProgress: number;
    awaitingReview: number;
    blocked: number;
    overdue: number;
    completedThisWeek: number;
  };
  myTasks: { dueToday: number; dueThisWeek: number; overdue: number };
  reviews: { pendingForMe: number };
}

export interface PortfolioRow {
  id: string;
  code: string;
  name: string;
  status: ProjectStatus;
  targetLaunchDate: string | null;
  baselinedEndDate: string | null;
  lastScheduledAt: string | null;
  taskCount: number;
  criticalCount: number;
  blockedCount: number;
  overdueCount: number;
  waitingReviews: number;
}

export interface WorkloadPerson {
  userId: string;
  name: string | null;
  image: string | null;
  weeklyHours: number;
  departmentId: string | null;
  departmentName: string | null;
  loggedHours: number;
  openTasks: number;
  utilisation: number;
}

export interface Workload {
  window: { from: string; to: string; weekdays: number };
  people: WorkloadPerson[];
  departments: {
    departmentId: string;
    name: string;
    color: string;
    headcount: number;
    loggedHours: number;
    utilisation: number;
  }[];
}

export interface Paged<T> {
  items: T[];
  total: number;
}
