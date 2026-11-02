import { useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useProject, useProjectTasks, useUpdateProject, useTimeline, useSubmissions, useProjectActivity, useDeleteProject, useMilestoneActions } from "@/features/hooks";
import { useRequiredSession } from "@/features/session";
import { Button, IconButton } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, ErrorState, LoadingState, Figure, PageHeader } from "@/components/ui/surface";
import { PriorityLabel, StatusLabel, Tag } from "@/components/ui/status";
import { DateField, SelectField, TextArea, TextField } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScheduleTab } from "@/features/project/schedule-tab";
import { formatShortDate, formatDate, formatVariance } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TaskStatus } from "@zerotask/domain";

/**
 * The project page: one header, one set of tabs.
 *
 * Tasks is the default tab because that is what the page is for. Schedule,
 * submissions, documents, activity, and settings follow. Everything the header
 * shows is a fact about the plan, not a decoration.
 */
export default function ProjectDetailPage() {
  const { projectId } = useParams({ from: "/app/projects/$projectId" });
  const { capabilities } = useRequiredSession();
  const navigate = useNavigate();

  const { data: project, isLoading, error, refetch } = useProject(projectId);
  const { data: timeline } = useTimeline(projectId);
  const { data: submissions } = useSubmissions(projectId);

  const remove = useDeleteProject();

  const [settingsOpen, setSettingsOpen] = useState(false);

  if (error) {
    return (
      <PageHeader
        title="Project"
        description="This project could not be loaded. It may have been deleted, or you may not be a member."
        actions={<Button onClick={() => void refetch()}>Try again</Button>}
      />
    );
  }

  if (isLoading || !project) {
    return <LoadingState label="Loading project" />;
  }

  const late =
    project.baselinedEndDate !== null &&
    project.targetLaunchDate !== null &&
    project.baselinedEndDate > project.targetLaunchDate;

  const pendingReviews = submissions?.filter((s) => s.status === "pending_review").length ?? 0;

  const confirmDelete = async () => {
    if (project.taskCount > 0 && !window.confirm(`Delete ${project.code} and its ${project.taskCount} tasks? The history stays in the database but the project leaves every list.`)) {
      return;
    }
    await remove.mutateAsync(project.id);
    void navigate({ to: "/projects" });
  };

  return (
    <>
      <PageHeader
        title={`${project.code} ${project.name}`}
        description={
          <span className="block max-w-prose">
            {project.description?.split("\n\ntemplate:")[0] || "No description yet."}
          </span>
        }
        meta={
          <>
            <ProjectStatusLabelInline status={project.status} />
            <span className="text-meta text-ink-muted">
              {project.ownerName ? `Owned by ${project.ownerName}` : "No owner"}
            </span>
            <span className="text-meta text-ink-muted">
              {project.openTaskCount} of {project.taskCount} tasks open
            </span>
            <span className="tnum text-meta">
              <span className={late ? "text-danger" : "text-ink-muted"}>
                {project.baselinedEndDate ? `Scheduled to finish ${formatDate(project.baselinedEndDate)}` : "Not scheduled yet"}
              </span>
              {project.targetLaunchDate && (
                <span className="ml-2 text-faint">
                  target {formatDate(project.targetLaunchDate)} ·{" "}
                  {formatVariance(
                    project.baselinedEndDate && project.targetLaunchDate
                      ? Math.round(
                          (Date.parse(project.baselinedEndDate) - Date.parse(project.targetLaunchDate)) /
                            86_400_000,
                        )
                      : null,
                  )}
                </span>
              )}
            </span>
          </>
        }
        actions={
          <>
            {pendingReviews > 0 && (
              <Button asChild variant="secondary" size="sm">
                <Link to="/reviews" aria-label={`${pendingReviews} submissions waiting for review`}>
                  {pendingReviews} to review
                </Link>
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => setSettingsOpen(true)}>
              Settings
            </Button>
          </>
        }
      />

      <div className="p-4 sm:p-6">
        <Tabs defaultValue="tasks">
          <TabsList aria-label="Project sections">
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="schedule">Schedule</TabsTrigger>
            <TabsTrigger value="submissions">
              Submissions
              {pendingReviews > 0 && (
                <span className="tnum rounded-mark bg-caution px-1 text-[10px] font-semibold text-surface">
                  {pendingReviews}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="milestones">Milestones</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
          </TabsList>

          <TabsContent value="tasks">
            <TasksPanel projectId={project.id} />
          </TabsContent>

          <TabsContent value="schedule">
            <ScheduleTab projectId={project.id} timeline={timeline} />
          </TabsContent>

          <TabsContent value="submissions">
            <SubmissionsPanel projectId={project.id} />
          </TabsContent>

          <TabsContent value="milestones">
            <MilestonesPanel projectId={project.id} />
          </TabsContent>

          <TabsContent value="activity">
            <ActivityPanel projectId={project.id} />
          </TabsContent>

          <TabsContent value="team">
            <TeamPanel projectId={project.id} />
          </TabsContent>
        </Tabs>
      </div>

      <ProjectSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        project={project}
        canManage={capabilities.createProject}
        onDelete={() => void confirmDelete()}
      />
    </>
  );
}

function ProjectStatusLabelInline({ status }: { status: string }) {
  const label = { draft: "Draft", active: "Active", on_hold: "On hold", completed: "Completed", archived: "Archived" }[status] ?? status;
  const tone = { draft: "text-ink-muted", active: "text-accent-ink", on_hold: "text-caution", completed: "text-settled", archived: "text-faint" }[status] ?? "text-ink-muted";
  return <span className={cn("text-meta font-medium", tone)}>{label}</span>;
}

// --- tasks -------------------------------------------------------------------

const STATUS_ORDER: TaskStatus[] = ["in_progress", "pending_review", "blocked", "not_started", "completed", "cancelled"];

function TasksPanel({ projectId }: { projectId: string }) {
  const { data, isLoading, error, refetch } = useProjectTasks(projectId);

  if (error) {
    return <ErrorState description="The task list could not be loaded." action={<Button onClick={() => void refetch()}>Try again</Button>} />;
  }

  if (isLoading) return <LoadingState label="Loading tasks" />;

  const tasks = data?.items ?? [];

  if (tasks.length === 0) {
    return (
      <div className="rounded-panel border border-rule bg-surface">
        <EmptyState
          title="No tasks yet"
          description="Tasks carry the duration, the assignee, and the links that make the schedule real. Add the first one to start the plan."
        />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-panel border border-rule bg-surface">
      <table className="w-full text-left">
        <caption className="sr-only">Tasks in this project, ordered by code</caption>
        <thead>
          <tr className="border-b border-rule bg-sunk text-label font-medium text-ink-muted">
            <th scope="col" className="px-3 py-2">Code</th>
            <th scope="col" className="px-3 py-2">Task</th>
            <th scope="col" className="hidden px-3 py-2 md:table-cell">Assignee</th>
            <th scope="col" className="px-3 py-2">Status</th>
            <th scope="col" className="hidden px-3 py-2 sm:table-cell">Priority</th>
            <th scope="col" className="hidden px-3 py-2 lg:table-cell">Dates</th>
            <th scope="col" className="hidden px-3 py-2 text-right xl:table-cell">Float</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {tasks.map((task) => (
            <tr key={task.id} className="h-(--row-height) transition-colors hover:bg-sunk">
              <td className="px-3 font-mono text-meta text-ink-muted tnum">{task.code}</td>
              <td className="max-w-0 px-3">
                <span className="block truncate text-compact text-ink">{task.name}</span>
                {task.labels.length > 0 && (
                  <span className="mt-0.5 flex flex-wrap gap-1">
                    {task.labels.map((label) => (
                      <Tag key={label.id} name={label.name} color={label.color} />
                    ))}
                  </span>
                )}
              </td>
              <td className="hidden px-3 text-compact text-ink-muted md:table-cell">
                {task.assigneeName ?? "Unassigned"}
              </td>
              <td className="px-3">
                <StatusLabel status={task.status} />
              </td>
              <td className="hidden px-3 sm:table-cell">
                <PriorityLabel priority={task.priority} />
              </td>
              <td className="tnum hidden px-3 text-meta text-ink-muted lg:table-cell">
                {formatShortDate(task.earlyStart ?? task.plannedStartDate)} → {formatShortDate(task.earlyFinish ?? task.plannedEndDate)}
              </td>
              <td className="tnum hidden px-3 text-right text-meta lg:table-cell">
                {task.isCritical ? (
                  <span className="font-medium text-danger">critical</span>
                ) : (
                  <span className="text-ink-muted">{task.totalFloatDays ?? "–"}d</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- submissions -------------------------------------------------------------

function SubmissionsPanel({ projectId }: { projectId: string }) {
  const { data, isLoading } = useSubmissions(projectId);

  if (isLoading) return <LoadingState label="Loading submissions" />;

  const rows = data ?? [];

  if (rows.length === 0) {
    return (
      <div className="rounded-panel border border-rule bg-surface">
        <EmptyState
          title="Nothing has been submitted yet"
          description="When someone finishes work on a task they submit it here for review. Approvers sign off, and only then does the task complete."
        />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-panel border border-rule bg-surface">
      <ul className="divide-y divide-rule">
        {rows.map((submission) => (
          <li key={submission.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-3 sm:h-(--row-height) sm:py-0">
            <span className="tnum w-24 shrink-0 font-mono text-meta text-ink-muted">{submission.taskCode}</span>
            <span className="min-w-0 flex-1 truncate text-compact text-ink">{submission.taskName}</span>
            <span className="text-meta text-ink-muted">{submission.submitterName}</span>
            <SubmissionStatusLabel status={submission.status} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SubmissionStatusLabel({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    pending_review: { label: "In review", className: "text-caution" },
    approved: { label: "Approved", className: "text-settled" },
    rejected: { label: "Returned", className: "text-danger" },
    revision_required: { label: "Revision needed", className: "text-caution" },
  };
  const entry = map[status] ?? { label: status, className: "text-ink-muted" };
  return <span className={cn("text-meta font-medium", entry.className)}>{entry.label}</span>;
}

// --- milestones --------------------------------------------------------------

function MilestonesPanel({ projectId }: { projectId: string }) {
  const { data: project } = useProject(projectId);
  const { create, update, remove } = useMilestoneActions(projectId);
  const [name, setName] = useState("");
  const [targetDate, setTargetDate] = useState("");

  const milestones = project?.milestones ?? [];

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    if (name.trim().length < 2) return;
    await create.mutateAsync({ name: name.trim(), targetDate: targetDate || null });
    setName("");
    setTargetDate("");
  };

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={(event) => void add(event)} className="flex flex-wrap items-end gap-3 rounded-panel border border-rule bg-surface p-3">
        <TextField
          label="Milestone name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="min-w-48 flex-1"
          placeholder="e.g. Integration in staging"
        />
        <DateField label="Target date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
        <Button type="submit" variant="primary" disabled={name.trim().length < 2}>
          Add milestone
        </Button>
      </form>

      {milestones.length === 0 ? (
        <div className="rounded-panel border border-rule bg-surface">
          <EmptyState
            title="No milestones"
            description="A milestone is a date the project is aiming at, such as a sign-off or a go-live. Tasks can be attached to one."
          />
        </div>
      ) : (
        <ul className="overflow-hidden rounded-panel border border-rule bg-surface">
          {milestones.map((milestone) => (
            <li key={milestone.id} className="flex h-(--row-height) items-center gap-3 border-b border-rule px-3 last:border-b-0">
              <span className="min-w-0 flex-1 truncate text-compact text-ink">{milestone.name}</span>
              <span className="tnum text-meta text-ink-muted">
                {milestone.completedTaskCount}/{milestone.taskCount} tasks
              </span>
              <span className="tnum w-24 text-right text-meta text-ink-muted">
                {formatShortDate(milestone.targetDate)}
              </span>
              <select
                aria-label={`Status of ${milestone.name}`}
                value={milestone.status}
                onChange={(event) =>
                  void update.mutateAsync({
                    milestoneId: milestone.id,
                    status: event.target.value as "not_started" | "in_progress" | "completed",
                  })
                }
                className="h-7 rounded-control border border-input bg-surface px-2 text-meta"
              >
                <option value="not_started">Not reached</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Reached</option>
              </select>
              <IconButton label={`Remove ${milestone.name}`} variant="danger" onClick={() => void remove.mutateAsync(milestone.id)}>
                ✕
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- activity ----------------------------------------------------------------

function ActivityPanel({ projectId }: { projectId: string }) {
  const { data, isLoading } = useProjectActivity(projectId);

  if (isLoading) return <LoadingState label="Loading activity" />;

  const events = data ?? [];

  if (events.length === 0) {
    return (
      <div className="rounded-panel border border-rule bg-surface">
        <EmptyState
          title="No activity yet"
          description="Every change to this project is recorded here: edits, submissions, schedule runs, and decisions."
        />
      </div>
    );
  }

  return (
    <div className="rounded-panel border border-rule bg-surface">
      <ol className="divide-y divide-rule">
        {events.map((event) => (
          <li key={event.id} className="flex items-baseline gap-3 px-3 py-2">
            <span className="w-32 shrink-0 text-meta font-medium text-ink">{event.actorName ?? "Someone"}</span>
            <span className="min-w-0 flex-1 text-compact text-ink">{event.summary}</span>
            <time dateTime={event.createdAt} className="shrink-0 text-meta text-faint">
              {formatShortDate(event.createdAt.slice(0, 10))}
            </time>
          </li>
        ))}
      </ol>
    </div>
  );
}

// --- team --------------------------------------------------------------------

function TeamPanel({ projectId }: { projectId: string }) {
  const { data: project } = useProject(projectId);
  const members = project?.members ?? [];

  if (members.length === 0) {
    return (
      <div className="rounded-panel border border-rule bg-surface">
        <EmptyState title="No members" description="Members can see the project and be assigned work in it." />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-panel border border-rule bg-surface">
      <ul className="divide-y divide-rule">
        {members.map((member) => (
          <li key={member.userId} className="flex h-(--row-height) items-center gap-3 px-3">
            <span className="min-w-0 flex-1 truncate text-compact text-ink">{member.name ?? member.email}</span>
            <span className="text-meta text-ink-muted">{member.role}</span>
            <span className="tnum hidden text-meta text-ink-muted sm:block">{member.openTasks} open</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- settings ----------------------------------------------------------------

function ProjectSettingsDialog({
  open,
  onOpenChange,
  project,
  canManage,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: NonNullable<ReturnType<typeof useProject>["data"]>;
  canManage: boolean;
  onDelete: () => void;
}) {
  const update = useUpdateProject(project.id);

  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description?.split("\n\ntemplate:")[0] ?? "");
  const [status, setStatus] = useState(project.status);
  const [targetLaunchDate, setTargetLaunchDate] = useState(project.targetLaunchDate ?? "");

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    await update.mutateAsync({
      name: name.trim(),
      description: description.trim() || null,
      status,
      targetLaunchDate: targetLaunchDate || null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Project settings</DialogTitle>
          <DialogDescription>
            The code {project.code} is fixed. Dates here feed the schedule the next time it runs.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void save(event)} className="flex flex-col gap-3" noValidate>
          <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} required disabled={!canManage} />
          <TextArea
            label="Description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            disabled={!canManage}
          />

          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="Status"
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof project.status)}
              disabled={!canManage}
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="on_hold">On hold</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </SelectField>
            <DateField
              label="Target launch date"
              value={targetLaunchDate}
              onChange={(event) => setTargetLaunchDate(event.target.value)}
              disabled={!canManage}
            />
          </div>

          <div className="rounded-control border border-rule bg-sunk px-2.5 py-2 text-meta text-ink-muted">
            {project.progressPercent}% of the planned duration is done across {project.taskCount} tasks.
          </div>

          <DialogFooter>
            {canManage && (
              <Button type="button" variant="danger" onClick={onDelete} className="mr-auto">
                Delete project
              </Button>
            )}
            <Button type="button" variant="quiet" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={update.isPending || !canManage}>
              {update.isPending ? "Saving" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { STATUS_ORDER, Figure, TextField, formatVariance };
