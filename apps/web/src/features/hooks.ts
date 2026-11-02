import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { ApiRequestError } from "@/lib/api/client";
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
  Submission,
  Task,
  TaskDetail,
  TemplateDetail,
  TemplateSummary,
  Timeline,
  Workload,
} from "@/lib/api/types";
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
 * Every server interaction goes through these hooks.
 *
 * Reads are `useQuery` with a key that mirrors the URL, so invalidation after a
 * write is one string and two views of the same data cannot disagree. Writes are
 * `useMutation` with the invalidation in `onSuccess`, never in the component.
 *
 * Errors reach the user through `toast.error`, in one place, instead of each page
 * building its own failure banner.
 */

function errorText(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}

/** Wraps a mutation so failures surface once, as a toast, with the server's words. */
function useAction<TInput, TOutput>(
  action: (input: TInput) => Promise<TOutput>,
  options: {
    invalidate?: string[][];
    success?: string;
    /** Picks the toast from the result, for actions that may only partly succeed. */
    successFor?: (output: TOutput) => string;
    onDone?: (output: TOutput) => void;
  } = {},
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: action,
    onSuccess: (output) => {
      for (const key of options.invalidate ?? []) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      const message = options.successFor ? options.successFor(output) : options.success;
      if (message) toast.success(message);
      options.onDone?.(output);
    },
    onError: (error) => toast.error(errorText(error)),
  });
}

// --- reads -------------------------------------------------------------------

export function useSessionQuery() {
  return useQuery({ queryKey: ["session"], queryFn: () => api.session.get(), staleTime: 5 * 60_000 });
}

export function useProjects(params: {
  status?: ProjectStatus;
  search?: string;
  scope?: "mine" | "all" | "archived";
  order?: "recent" | "name" | "launch";
}) {
  return useQuery({
    queryKey: ["projects", params],
    queryFn: () => api.projects.list(params),
    placeholderData: (previous) => previous,
  });
}

export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: ["projects", projectId],
    queryFn: () => api.projects.get(projectId!),
    enabled: projectId !== undefined,
  });
}

export function useProjectMembers(projectId: string | undefined) {
  return useQuery({
    queryKey: ["projects", projectId, "members"],
    queryFn: () => api.projects.members(projectId!),
    enabled: projectId !== undefined,
  });
}

export function usePeopleLookup(search: string) {
  return useQuery({
    queryKey: ["people", "lookup", search],
    queryFn: () => api.people.lookup({ search: search || undefined }),
    staleTime: 60_000,
  });
}

export function usePeople(params: {
  search?: string;
  departmentId?: string;
  role?: Role;
  page?: number;
}) {
  return useQuery({
    queryKey: ["people", params],
    queryFn: () =>
      api.people.list({
        search: params.search || undefined,
        departmentId: params.departmentId || undefined,
        role: params.role,
        limit: 50,
        offset: ((params.page ?? 1) - 1) * 50,
      }),
    placeholderData: (previous) => previous,
  });
}

export function useDepartments() {
  return useQuery({ queryKey: ["departments"], queryFn: api.departments.list, staleTime: 5 * 60_000 });
}

export function useProjectTasks(
  projectId: string | undefined,
  params: {
    status?: TaskStatus[];
    priority?: TaskPriority;
    assigneeId?: string;
    milestoneId?: string;
    labelId?: string;
    search?: string;
    criticalOnly?: boolean;
    order?: "code" | "start" | "due" | "priority" | "float";
  } = {},
) {
  return useQuery({
    queryKey: ["projects", projectId, "tasks", params],
    queryFn: () => api.tasks.forProject(projectId!, params),
    enabled: projectId !== undefined,
    placeholderData: (previous) => previous,
  });
}

export function useTask(projectId: string | undefined, taskId: string | undefined) {
  return useQuery({
    queryKey: ["projects", projectId, "tasks", taskId],
    queryFn: () => api.tasks.get(projectId!, taskId!),
    enabled: projectId !== undefined && taskId !== undefined,
  });
}

export function useMyWork(params: { from?: string; to?: string } = {}) {
  return useQuery({ queryKey: ["my-work", params], queryFn: () => api.myWork.get(params) });
}

export function useReviewQueue() {
  return useQuery({ queryKey: ["my-work", "reviews"], queryFn: api.myWork.reviews });
}

export function useUpcoming(days = 7) {
  return useQuery({ queryKey: ["my-work", "upcoming", days], queryFn: () => api.myWork.upcoming(days) });
}

export function useMyActivity(limit = 40) {
  return useQuery({ queryKey: ["my-work", "activity", limit], queryFn: () => api.myWork.activity(limit) });
}

export function useSubmissions(projectId: string | undefined) {
  return useQuery({
    queryKey: ["projects", projectId, "submissions"],
    queryFn: () => api.submissions.forProject(projectId!),
    enabled: projectId !== undefined,
  });
}

export function useSchedule(projectId: string | undefined) {
  return useQuery({
    queryKey: ["projects", projectId, "schedule"],
    queryFn: () => api.schedule.get(projectId!),
    enabled: projectId !== undefined,
  });
}

export function useTimeline(projectId: string | undefined) {
  return useQuery({
    queryKey: ["projects", projectId, "schedule", "timeline"],
    queryFn: () => api.schedule.timeline(projectId!),
    enabled: projectId !== undefined,
  });
}

export function useRevisions(projectId: string | undefined) {
  return useQuery({
    queryKey: ["projects", projectId, "schedule", "revisions"],
    queryFn: () => api.schedule.revisions(projectId!),
    enabled: projectId !== undefined,
  });
}

export function useDocuments(projectId?: string, search?: string) {
  return useQuery({
    queryKey: ["documents", projectId ?? "all", search ?? ""],
    queryFn: () =>
      projectId
        ? api.documents.forProject(projectId, { search: search || undefined })
        : api.documents.list({ search: search || undefined }),
  });
}

export function useTemplates() {
  return useQuery({ queryKey: ["templates"], queryFn: api.templates.list });
}

export function useTemplate(id: string | undefined) {
  return useQuery({
    queryKey: ["templates", id],
    queryFn: () => api.templates.get(id!),
    enabled: id !== undefined,
  });
}

export function useNotifications(limit = 30) {
  return useQuery({
    queryKey: ["notifications", limit],
    queryFn: () => api.notifications.list({ limit }),
    refetchInterval: 60_000,
  });
}

export function useNotificationPreferences() {
  return useQuery({ queryKey: ["notifications", "preferences"], queryFn: api.notifications.preferences });
}

export function useProjectActivity(projectId: string | undefined, limit = 40) {
  return useQuery({
    queryKey: ["projects", projectId, "activity", limit],
    queryFn: () => api.activity.forProject(projectId!, limit),
    enabled: projectId !== undefined,
  });
}

export function useFavorites() {
  return useQuery({ queryKey: ["favorites"], queryFn: api.favorites.list });
}

export function useOverview() {
  return useQuery({ queryKey: ["overview"], queryFn: api.insights.overview });
}

export function usePortfolio() {
  return useQuery({ queryKey: ["portfolio"], queryFn: api.insights.portfolio });
}

export function useWorkload(from: string, to: string, departmentId?: string) {
  return useQuery({
    queryKey: ["workload", from, to, departmentId ?? "all"],
    queryFn: () => api.insights.workload({ from, to, departmentId }),
  });
}

// --- writes ------------------------------------------------------------------

export function useCreateProject() {
  return useAction(
    (input: Parameters<typeof api.projects.create>[0]) => api.projects.create(input),
    { invalidate: [["projects"], ["overview"]], success: "Project created" },
  );
}

export function useUpdateProject(projectId: string) {
  return useAction((input: Parameters<typeof api.projects.update>[1]) => api.projects.update(projectId, input), {
    invalidate: [["projects"], ["projects", projectId], ["overview"]],
    success: "Project saved",
  });
}

export function useDeleteProject() {
  return useAction((projectId: string) => api.projects.remove(projectId), {
    invalidate: [["projects"], ["overview"]],
    success: "Project moved to the deleted list",
  });
}

export function useProjectMemberActions(projectId: string) {
  const invalidate = [["projects", projectId], ["projects", projectId, "members"]];

  const add = useAction(
    (input: { userId: string; role?: ProjectRole }) => api.projects.addMember(projectId, input),
    { invalidate, success: "Member added" },
  );
  const updateRole = useAction(
    (input: { userId: string; role: ProjectRole }) => api.projects.updateMember(projectId, input.userId, input.role),
    { invalidate, success: "Role updated" },
  );
  const remove = useAction((userId: string) => api.projects.removeMember(projectId, userId), {
    invalidate,
    success: "Member removed",
  });

  return { add, updateRole, remove };
}

export function useMilestoneActions(projectId: string) {
  const invalidate = [["projects", projectId], ["projects", projectId, "milestones"]];

  const create = useAction(
    (input: { name: string; description?: string | null; targetDate?: string | null }) =>
      api.projects.createMilestone(projectId, input),
    { invalidate, success: "Milestone added" },
  );
  const update = useAction(
    (input: {
      milestoneId: string;
      name?: string;
      description?: string | null;
      targetDate?: string | null;
      status?: "not_started" | "in_progress" | "completed";
    }) => {
      const { milestoneId, ...rest } = input;
      return api.projects.updateMilestone(projectId, milestoneId, rest);
    },
    { invalidate, success: "Milestone saved" },
  );
  const remove = useAction((milestoneId: string) => api.projects.removeMilestone(projectId, milestoneId), {
    invalidate,
    success: "Milestone removed",
  });

  return { create, update, remove };
}

export function useLabelActions(projectId: string) {
  const invalidate = [["projects", projectId]];

  const create = useAction((input: { name: string; color?: string }) => api.projects.createLabel(projectId, input), {
    invalidate,
    success: "Label created",
  });
  const remove = useAction((labelId: string) => api.projects.removeLabel(projectId, labelId), {
    invalidate,
    success: "Label removed",
  });

  return { create, remove };
}

export function useCreateTask(projectId: string) {
  return useAction((input: Parameters<typeof api.tasks.create>[1]) => api.tasks.create(projectId, input), {
    invalidate: [["projects"], ["overview"], ["my-work"]],
    success: "Task created",
  });
}

export function useUpdateTask(projectId: string, taskId: string) {
  return useAction((input: Parameters<typeof api.tasks.update>[2]) => api.tasks.update(projectId, taskId, input), {
    invalidate: [
      ["projects"],
      ["my-work"],
      ["overview"],
    ],
    success: "Task saved",
  });
}

export function useMoveTask(projectId: string) {
  return useAction(
    (input: { taskId: string; status: "not_started" | "in_progress" | "blocked" | "cancelled" }) =>
      api.tasks.move(projectId, input.taskId, input.status),
    {
      invalidate: [["projects", projectId, "tasks"], ["projects", projectId, "schedule"], ["my-work"], ["overview"]],
    },
  );
}

export function useDeleteTask(projectId: string) {
  return useAction((taskId: string) => api.tasks.remove(projectId, taskId), {
    invalidate: [["projects"], ["overview"], ["my-work"]],
    success: "Task deleted",
  });
}

export function useDependencyActions(projectId: string) {
  const invalidate = [["projects"], ["overview"], ["my-work"]];

  const add = useAction(
    (input: { predecessorId: string; successorId: string; type?: DependencyType; lagDays?: number }) =>
      api.tasks.addDependency(projectId, input),
    { invalidate, success: "Link added" },
  );
  const remove = useAction((dependencyId: string) => api.tasks.removeDependency(projectId, dependencyId), {
    invalidate,
    success: "Link removed",
  });

  return { add, remove };
}

export function useTaskPanelActions(projectId: string, taskId: string) {
  const invalidate = [["projects", projectId, "tasks", taskId], ["projects", projectId, "tasks"], ["my-work"]];

  const logWork = useAction(
    (input: { logDate: string; hours: number; note?: string | null }) =>
      api.tasks.logWork(projectId, taskId, input),
    { invalidate, success: "Hours logged" },
  );
  const removeWorkLog = useAction((logId: string) => api.tasks.removeWorkLog(projectId, taskId, logId), {
    invalidate,
  });
  const addChecklistItem = useAction((title: string) => api.tasks.addChecklistItem(projectId, taskId, title), {
    invalidate,
  });
  const toggleChecklistItem = useAction((input: { itemId: string; done: boolean }) =>
    api.tasks.toggleChecklistItem(projectId, taskId, input.itemId, input.done),
  );
  const addComment = useAction((body: string) => api.tasks.addComment(projectId, taskId, body), {
    invalidate,
    success: "Comment posted",
  });
  const removeComment = useAction((commentId: string) => api.tasks.removeComment(projectId, taskId, commentId), {
    invalidate,
  });
  const setApprovalConfig = useAction(
    (input: { requiredApprovals: number; approvalMode?: "any" | "all"; reviewerIds: string[] }) =>
      api.tasks.setApprovalConfig(projectId, taskId, input),
    { invalidate, success: "Approval settings saved" },
  );
  const addWatcher = useAction((userId: string) => api.tasks.addWatcher(projectId, taskId, userId), { invalidate });
  const removeWatcher = useAction((userId: string) => api.tasks.removeWatcher(projectId, taskId, userId), {
    invalidate,
  });
  const setLabels = useAction((labelIds: string[]) => api.tasks.setLabels(projectId, taskId, labelIds), {
    invalidate,
  });

  return {
    logWork,
    removeWorkLog,
    addChecklistItem,
    toggleChecklistItem,
    addComment,
    removeComment,
    setApprovalConfig,
    addWatcher,
    removeWatcher,
    setLabels,
  };
}

export function useSubmitForReview(projectId: string) {
  return useAction(
    (input: { taskId: string; body: Parameters<typeof api.submissions.create>[2] }) =>
      api.submissions.create(projectId, input.taskId, input.body),
    {
      invalidate: [
        ["projects", projectId],
        ["projects", projectId, "submissions"],
        ["projects", projectId, "tasks"],
        ["my-work", "reviews"],
        ["my-work"],
        ["overview"],
      ],
      success: "Submitted for review",
    },
  );
}

export function useDecideSubmission(projectId: string) {
  const invalidate = [
    ["projects", projectId],
    ["projects", projectId, "submissions"],
    ["projects", projectId, "tasks"],
    ["projects", projectId, "schedule"],
    ["my-work"],
    ["my-work", "reviews"],
    ["overview"],
  ];

  const approve = useAction(
    (input: { submissionId: string; note?: string }) =>
      api.submissions.approve(projectId, input.submissionId, input.note),
    {
      invalidate,
      // One approval may not settle the submission when several are required.
      successFor: (submission) =>
        submission.status === "pending_review"
          ? "Your approval is recorded. Waiting for the other reviewers."
          : "Submission approved",
    },
  );
  const reject = useAction(
    (input: { submissionId: string; note?: string }) =>
      api.submissions.reject(projectId, input.submissionId, input.note),
    { invalidate, success: "Submission returned to work" },
  );

  return { approve, reject };
}

export function useScheduleActions(projectId: string) {
  const invalidate = [
    ["projects", projectId, "schedule"],
    ["projects", projectId, "schedule", "timeline"],
    ["projects", projectId, "schedule", "revisions"],
    ["projects", projectId, "tasks"],
    ["projects"],
    ["overview"],
  ];

  const run = useAction(() => api.schedule.run(projectId), { invalidate, success: "Schedule recalculated" });

  const propose = useAction(
    (input: Parameters<typeof api.schedule.propose>[1]) => api.schedule.propose(projectId, input),
    { invalidate, success: "Schedule change proposed" },
  );

  const approve = useAction(
    (input: { revisionId: string; note?: string }) =>
      api.schedule.approve(projectId, input.revisionId, input.note),
    { invalidate, success: "Schedule change applied" },
  );

  const reject = useAction(
    (input: { revisionId: string; note?: string }) =>
      api.schedule.reject(projectId, input.revisionId, input.note),
    { invalidate, success: "Schedule change rejected" },
  );

  return { run, propose, approve, reject };
}

export function useDocumentActions() {
  const invalidate = [["documents"], ["overview"]];

  const upload = useAction((input: Parameters<typeof api.documents.upload>[0]) => api.documents.upload(input), {
    invalidate,
    success: "Document stored",
  });
  const remove = useAction((id: string) => api.documents.remove(id), { invalidate, success: "Document deleted" });

  return { upload, remove };
}

export function useTemplateActions() {
  const invalidate = [["templates"], ["projects"]];

  const create = useAction((input: Parameters<typeof api.templates.create>[0]) => api.templates.create(input), {
    invalidate,
    success: "Template saved",
  });
  const remove = useAction((id: string) => api.templates.remove(id), { invalidate, success: "Template deleted" });
  const instantiate = useAction(
    (input: { id: string; name: string; kickoffDate?: string | null }) =>
      api.templates.instantiate(input.id, { name: input.name, kickoffDate: input.kickoffDate }),
    { invalidate, success: "Project created from template" },
  );
  const capture = useAction((input: { projectId: string; name: string; category?: string }) => api.templates.capture(input), {
    invalidate,
    success: "Saved as a template",
  });

  return { create, remove, instantiate, capture };
}

export function useNotificationActions() {
  const invalidate = [["notifications"]];

  const markRead = useAction((ids: string[]) => api.notifications.markRead(ids), { invalidate });
  const markAllRead = useAction(() => api.notifications.markAllRead(), { invalidate });
  const updatePreferences = useAction(
    (input: Partial<Omit<NotificationPreferences, "userId">>) => api.notifications.updatePreferences(input),
    { invalidate: [["notifications", "preferences"]], success: "Notification settings saved" },
  );

  return { markRead, markAllRead, updatePreferences };
}

export function useFavoriteActions() {
  const invalidate = [["favorites"]];

  const add = useAction((input: { kind: "project" | "task" | "document"; entityId: string }) => api.favorites.add(input), {
    invalidate,
    success: "Pinned",
  });
  const remove = useAction((input: { kind: string; entityId: string }) => api.favorites.remove(input.kind, input.entityId), {
    invalidate,
    success: "Unpinned",
  });

  return { add, remove };
}

export function usePersonActions() {
  const update = useAction(
    (input: { id: string; body: Parameters<typeof api.people.update>[1] }) => api.people.update(input.id, input.body),
    { invalidate: [["people"], ["session"]], success: "Person updated" },
  );
  const remove = useAction((id: string) => api.people.remove(id), {
    invalidate: [["people"], ["departments"], ["session"]],
    success: "Person removed from the workspace",
  });

  return { update, remove };
}

export function useDepartmentActions() {
  const invalidate = [["departments"]];

  const create = useAction((input: Parameters<typeof api.departments.create>[0]) => api.departments.create(input), {
    invalidate,
    success: "Department created",
  });
  const update = useAction(
    (input: { id: string; body: Parameters<typeof api.departments.update>[1] }) =>
      api.departments.update(input.id, input.body),
    { invalidate, success: "Department saved" },
  );
  const remove = useAction((id: string) => api.departments.remove(id), {
    invalidate,
    success: "Department removed",
  });

  return { create, update, remove };
}

export function useUpdateMe() {
  return useAction((input: Parameters<typeof api.me.update>[0]) => api.me.update(input), {
    invalidate: [["session"], ["me"]],
    success: "Profile saved",
  });
}

// Re-exported so a page imports its types from one module.
export type {
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
  Submission,
  Task,
  TaskDetail,
  TemplateDetail,
  TemplateSummary,
  Timeline,
  Workload,
  DependencyType,
  DocumentKind,
  ProjectRole,
  ProjectStatus,
  Role,
  SubmissionKind,
  TaskPriority,
  TaskStatus,
};
