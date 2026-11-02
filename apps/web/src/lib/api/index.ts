import { http, queryString } from "./client";
import type {
  ActivityEvent,
  Department,
  DocumentRecord,
  Favorite,
  Milestone,
  MyWork,
  NotificationFeed,
  NotificationPreferences,
  Overview,
  Paged,
  Person,
  PersonLookup,
  PortfolioRow,
  ProjectDetail,
  ProjectListItem,
  ProjectMember,
  ReviewQueueItem,
  ScheduleRevision,
  ScheduleSummary,
  SessionResponse,
  Submission,
  Task,
  TaskDetail,
  TemplateDetail,
  TemplateSummary,
  Timeline,
  Workload,
} from "./types";
import type {
  DependencyType,
  DocumentKind,
  ProjectRole,
  ProjectStatus,
  Role,
  SubmissionKind,
  TaskPriority,
  TaskStatus,
} from "@zerotask/domain";

/**
 * One function per endpoint, grouped by resource. Pages never build a URL; they
 * call a named function, so a path change is one edit and the argument types are
 * checked at the call site.
 */

export const api = {
  session: {
    get: () => http.get<SessionResponse>("/account/session"),
  },

  me: {
    get: () => http.get<Person>("/me"),
    update: (input: {
      name?: string;
      jobTitle?: string | null;
      weeklyHours?: number;
      image?: string | null;
    }) => http.patch<Person>("/me", input),
  },

  people: {
    create: (input: { name: string; email: string; password: string }) => http.post<Person>("/people", input),
    list: (params: {
      search?: string;
      departmentId?: string;
      role?: Role;
      limit?: number;
      offset?: number;
    }) => http.get<Paged<Person>>(`/people${queryString(params)}`),
    lookup: (params: { search?: string; limit?: number }) =>
      http.get<PersonLookup[]>(`/people/lookup${queryString(params)}`),
    get: (id: string) => http.get<Person>(`/people/${id}`),
    update: (
      id: string,
      input: {
        name?: string;
        jobTitle?: string | null;
        weeklyHours?: number;
        role?: Role;
        departmentId?: string | null;
      },
    ) => http.patch<Person>(`/people/${id}`, input),
    remove: (id: string) => http.delete<{ ok: true }>(`/people/${id}`),
  },

  departments: {
    list: () => http.get<Department[]>("/departments"),
    create: (input: {
      code: string;
      name: string;
      description?: string | null;
      color?: string;
      dailyCapacityHours?: number;
    }) => http.post<Department>("/departments", input),
    update: (
      id: string,
      input: {
        name?: string;
        description?: string | null;
        color?: string;
        dailyCapacityHours?: number;
      },
    ) => http.patch<Department>(`/departments/${id}`, input),
    remove: (id: string) => http.delete<{ ok: true }>(`/departments/${id}`),
  },

  projects: {
    list: (params: {
      status?: ProjectStatus;
      search?: string;
      scope?: "mine" | "all" | "archived";
      order?: "recent" | "name" | "launch";
      limit?: number;
      offset?: number;
    }) => http.get<Paged<ProjectListItem>>(`/projects${queryString(params)}`),
    mine: () => http.get<{ id: string; code: string; name: string; status: ProjectStatus }[]>("/projects/mine"),
    get: (id: string) => http.get<ProjectDetail>(`/projects/${id}`),
    create: (input: {
      name: string;
      description?: string | null;
      ownerId?: string;
      status?: ProjectStatus;
      targetLaunchDate?: string | null;
      kickoffDate?: string | null;
      leadTimeDays?: number | null;
    }) => http.post<ProjectDetail>("/projects", input),
    update: (
      id: string,
      input: {
        name?: string;
        description?: string | null;
        status?: ProjectStatus;
        targetLaunchDate?: string | null;
        kickoffDate?: string | null;
        leadTimeDays?: number | null;
      },
    ) => http.patch<ProjectDetail>(`/projects/${id}`, input),
    remove: (id: string) => http.delete<{ ok: true }>(`/projects/${id}`),
    members: (id: string) => http.get<ProjectMember[]>(`/projects/${id}/members`),
    addMember: (id: string, input: { userId: string; role?: ProjectRole }) =>
      http.post<ProjectMember[]>(`/projects/${id}/members`, input),
    updateMember: (id: string, userId: string, role: ProjectRole) =>
      http.patch<ProjectMember[]>(`/projects/${id}/members/${userId}`, { role }),
    removeMember: (id: string, userId: string) =>
      http.delete<{ ok: true }>(`/projects/${id}/members/${userId}`),
    createMilestone: (
      id: string,
      input: { name: string; description?: string | null; targetDate?: string | null },
    ) => http.post<Milestone[]>(`/projects/${id}/milestones`, input),
    updateMilestone: (
      id: string,
      milestoneId: string,
      input: {
        name?: string;
        description?: string | null;
        targetDate?: string | null;
        status?: "not_started" | "in_progress" | "completed";
      },
    ) => http.patch<Milestone[]>(`/projects/${id}/milestones/${milestoneId}`, input),
    removeMilestone: (id: string, milestoneId: string) =>
      http.delete<Milestone[]>(`/projects/${id}/milestones/${milestoneId}`),
    createLabel: (id: string, input: { name: string; color?: string }) =>
      http.post<Milestone[]>(`/projects/${id}/labels`, input),
    removeLabel: (id: string, labelId: string) =>
      http.delete<Milestone[]>(`/projects/${id}/labels/${labelId}`),
  },

  tasks: {
    forProject: (
      projectId: string,
      params: {
        status?: TaskStatus | TaskStatus[];
        priority?: TaskPriority;
        assigneeId?: string;
        departmentId?: string;
        milestoneId?: string;
        labelId?: string;
        search?: string;
        criticalOnly?: boolean;
        order?: "code" | "start" | "due" | "priority" | "float";
        limit?: number;
        offset?: number;
      } = {},
    ) =>
      http.get<Paged<Task>>(
        `/projects/${projectId}/tasks${queryString({
          ...params,
          status: Array.isArray(params.status) ? params.status.join(",") : params.status,
        })}`,
      ),
    get: (projectId: string, taskId: string) =>
      http.get<TaskDetail>(`/projects/${projectId}/tasks/${taskId}`),
    create: (
      projectId: string,
      input: {
        name: string;
        description?: string | null;
        status?: TaskStatus;
        priority?: TaskPriority;
        durationDays?: number;
        estimatedHours?: number | null;
        plannedStartDate?: string | null;
        plannedEndDate?: string | null;
        assignedToId?: string | null;
        reviewerId?: string | null;
        departmentId?: string | null;
        milestoneId?: string | null;
        labelIds?: string[];
        dependsOn?: { taskId: string; type?: DependencyType; lagDays?: number }[];
      },
    ) => http.post<Task>(`/projects/${projectId}/tasks`, input),
    update: (
      projectId: string,
      taskId: string,
      input: Partial<{
        name: string;
        description: string | null;
        status: TaskStatus;
        priority: TaskPriority;
        durationDays: number;
        estimatedHours: number | null;
        progressPercent: number;
        plannedStartDate: string | null;
        plannedEndDate: string | null;
        actualStartDate: string | null;
        actualEndDate: string | null;
        assignedToId: string | null;
        reviewerId: string | null;
        departmentId: string | null;
        milestoneId: string | null;
        sortOrder: number;
      }>,
    ) => http.patch<Task>(`/projects/${projectId}/tasks/${taskId}`, input),
    remove: (projectId: string, taskId: string) =>
      http.delete<{ ok: true }>(`/projects/${projectId}/tasks/${taskId}`),
    move: (
      projectId: string,
      taskId: string,
      status: "not_started" | "in_progress" | "blocked" | "cancelled",
    ) => http.post<Task>(`/projects/${projectId}/tasks/${taskId}/move`, { status }),
    addDependency: (
      projectId: string,
      input: { predecessorId: string; successorId: string; type?: DependencyType; lagDays?: number },
    ) => http.post<Task>(`/projects/${projectId}/dependencies`, input),
    removeDependency: (projectId: string, dependencyId: string) =>
      http.delete<{ ok: true }>(`/projects/${projectId}/dependencies/${dependencyId}`),
    setLabels: (projectId: string, taskId: string, labelIds: string[]) =>
      http.patch<Task>(`/projects/${projectId}/tasks/${taskId}/labels`, { labelIds }),
    logWork: (
      projectId: string,
      taskId: string,
      input: { logDate: string; hours: number; note?: string | null },
    ) => http.post<TaskDetail>(`/projects/${projectId}/tasks/${taskId}/work-logs`, input),
    removeWorkLog: (projectId: string, taskId: string, logId: string) =>
      http.delete<{ ok: true }>(`/projects/${projectId}/tasks/${taskId}/work-logs/${logId}`),
    addChecklistItem: (projectId: string, taskId: string, title: string) =>
      http.post<TaskDetail>(`/projects/${projectId}/tasks/${taskId}/checklist`, { title }),
    toggleChecklistItem: (projectId: string, taskId: string, itemId: string, done: boolean) =>
      http.patch<TaskDetail>(`/projects/${projectId}/tasks/${taskId}/checklist/${itemId}`, { done }),
    addComment: (projectId: string, taskId: string, body: string) =>
      http.post<TaskDetail>(`/projects/${projectId}/tasks/${taskId}/comments`, { body }),
    removeComment: (projectId: string, taskId: string, commentId: string) =>
      http.delete<TaskDetail>(`/projects/${projectId}/tasks/${taskId}/comments/${commentId}`),
    setApprovalConfig: (
      projectId: string,
      taskId: string,
      input: { requiredApprovals: number; approvalMode?: "any" | "all"; reviewerIds: string[] },
    ) => http.put<TaskDetail>(`/projects/${projectId}/tasks/${taskId}/approval-config`, input),
    addWatcher: (projectId: string, taskId: string, userId: string) =>
      http.post<TaskDetail>(`/projects/${projectId}/tasks/${taskId}/watchers`, { userId }),
    removeWatcher: (projectId: string, taskId: string, userId: string) =>
      http.delete<TaskDetail>(`/projects/${projectId}/tasks/${taskId}/watchers/${userId}`),
  },

  myWork: {
    get: (params: { from?: string; to?: string } = {}) =>
      http.get<MyWork>(`/my-work${queryString(params)}`),
    reviews: () => http.get<ReviewQueueItem[]>("/my-work/reviews"),
    upcoming: (days = 7) => http.get<Task[]>(`/my-work/upcoming${queryString({ days })}`),
    activity: (limit = 40) => http.get<ActivityEvent[]>(`/my-work/activity${queryString({ limit })}`),
  },

  submissions: {
    forProject: (projectId: string, params: { status?: string; limit?: number } = {}) =>
      http.get<Submission[]>(`/projects/${projectId}/submissions${queryString(params)}`),
    create: (
      projectId: string,
      taskId: string,
      input: {
        kind?: SubmissionKind;
        note?: string | null;
        progressPercent?: number;
        hoursSpent?: number | null;
        documentIds?: string[];
      },
    ) => http.post<Submission>(`/projects/${projectId}/tasks/${taskId}/submissions`, input),
    approve: (projectId: string, submissionId: string, note?: string) =>
      http.post<Submission>(`/projects/${projectId}/submissions/${submissionId}/approve`, { note }),
    reject: (projectId: string, submissionId: string, note?: string) =>
      http.post<Submission>(`/projects/${projectId}/submissions/${submissionId}/reject`, { note }),
  },

  schedule: {
    holidayComparison: (projectId: string) => http.get<import("./types").HolidayComparison>(`/projects/${projectId}/schedule/holiday-comparison`),
    get: (projectId: string) => http.get<ScheduleSummary>(`/projects/${projectId}/schedule`),
    timeline: (projectId: string) => http.get<Timeline>(`/projects/${projectId}/schedule/timeline`),
    run: (projectId: string) => http.post<ScheduleSummary>(`/projects/${projectId}/schedule/run`),
    revisions: (projectId: string) =>
      http.get<ScheduleRevision[]>(`/projects/${projectId}/schedule/revisions`),
    propose: (
      projectId: string,
      input: {
        title: string;
        reason: string;
        source?: "internal" | "client" | "supplier";
        changes: { taskId: string; plannedStartDate: string; durationDays?: number; note?: string }[];
      },
    ) => http.post<ScheduleRevision[]>(`/projects/${projectId}/schedule/revisions`, input),
    approve: (projectId: string, revisionId: string, note?: string) =>
      http.post<ScheduleRevision[]>(
        `/projects/${projectId}/schedule/revisions/${revisionId}/approve`,
        { note },
      ),
    reject: (projectId: string, revisionId: string, note?: string) =>
      http.post<ScheduleRevision[]>(
        `/projects/${projectId}/schedule/revisions/${revisionId}/reject`,
        { note },
      ),
  },

  documents: {
    list: (params: { search?: string; kind?: DocumentKind; limit?: number; offset?: number } = {}) =>
      http.get<Paged<DocumentRecord>>(`/documents${queryString(params)}`),
    forProject: (
      projectId: string,
      params: { search?: string; kind?: DocumentKind; limit?: number; offset?: number } = {},
    ) => http.get<Paged<DocumentRecord>>(`/projects/${projectId}/documents${queryString(params)}`),
    upload: (input: {
      file?: File;
      name?: string;
      projectId?: string;
      taskId?: string;
      kind?: DocumentKind;
      note?: string;
    }) => {
      const form = new FormData();
      if (input.file) form.append("file", input.file);
      if (input.name) form.append("name", input.name);
      if (input.projectId) form.append("projectId", input.projectId);
      if (input.taskId) form.append("taskId", input.taskId);
      if (input.kind) form.append("kind", input.kind);
      if (input.note) form.append("note", input.note);
      return http.upload<DocumentRecord>("/documents", form);
    },
    remove: (id: string) => http.delete<{ ok: true }>(`/documents/${id}`),
    fileUrl: (id: string) => `/api/documents/${id}/file`,
  },

  templates: {
    list: () => http.get<TemplateSummary[]>("/templates"),
    get: (id: string) => http.get<TemplateDetail>(`/templates/${id}`),
    create: (input: {
      name: string;
      description?: string | null;
      category?: string;
      tasks?: {
        code: string;
        name: string;
        durationDays?: number;
        priority?: TaskPriority;
        estimatedHours?: number | null;
        description?: string | null;
      }[];
      dependencies?: {
        predecessorCode: string;
        successorCode: string;
        type?: DependencyType;
        lagDays?: number;
      }[];
    }) => http.post<TemplateDetail>("/templates", input),
    remove: (id: string) => http.delete<{ ok: true }>(`/templates/${id}`),
    instantiate: (
      id: string,
      input: { name: string; kickoffDate?: string | null; ownerId?: string },
    ) => http.post<{ id: string; code: string; name: string }>(`/templates/${id}/instantiate`, input),
    capture: (input: { projectId: string; name: string; category?: string }) =>
      http.post<TemplateDetail>("/templates/capture", input),
  },

  notifications: {
    list: (params: { limit?: number; unreadOnly?: boolean } = {}) =>
      http.get<NotificationFeed>(`/notifications${queryString(params)}`),
    markRead: (ids: string[]) => http.post<{ ok: true; updated: number }>("/notifications/read", { ids }),
    markAllRead: () => http.post<{ ok: true; updated: number }>("/notifications/read-all"),
    preferences: () => http.get<NotificationPreferences>("/notification-preferences"),
    updatePreferences: (input: Partial<Omit<NotificationPreferences, "userId">>) =>
      http.patch<NotificationPreferences>("/notification-preferences", input),
  },

  activity: {
    forProject: (projectId: string, limit = 40) =>
      http.get<ActivityEvent[]>(`/projects/${projectId}/activity${queryString({ limit })}`),
  },

  favorites: {
    list: () => http.get<Favorite[]>("/favorites"),
    add: (input: { kind: "project" | "task" | "document"; entityId: string }) =>
      http.post<Favorite[]>("/favorites", input),
    remove: (kind: string, entityId: string) =>
      http.delete<{ ok: true }>(`/favorites/${kind}/${entityId}`),
  },

  insights: {
    overview: () => http.get<Overview>("/overview"),
    portfolio: () => http.get<PortfolioRow[]>("/portfolio"),
    workload: (params: { from: string; to: string; departmentId?: string }) =>
      http.get<Workload>(`/workload${queryString(params)}`),
  },
};

export type Api = typeof api;
