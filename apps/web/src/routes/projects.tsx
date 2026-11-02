import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useProjects, useCreateProject } from "@/features/hooks";
import { useRequiredSession } from "@/features/session";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DateField, NumberField, SelectField, TextArea, TextField } from "@/components/ui/field";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/surface";
import { ProjectStatusLabel } from "@/components/ui/status";
import { IconPlus, IconSearch } from "@/components/icon";
import { formatDate, formatVariance } from "@/lib/format";
import type { ProjectStatus } from "@zerotask/domain";
import { PROJECT_STATUS_LABEL } from "@zerotask/domain";

/**
 * The project list.
 *
 * One row per project, ordered by recency, with the two numbers a delivery lead
 * scans for: how much is open, and whether the computed finish is past the target.
 * Filters sit below the list, because the list is the reason you came.
 */

const STATUS_FILTERS = ["all", "draft", "active", "on_hold", "completed"] as const;

export default function ProjectsPage() {
  const { capabilities } = useRequiredSession();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]>("all");
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, error, refetch } = useProjects({
    search: search || undefined,
    status: status === "all" ? undefined : (status as ProjectStatus),
  });

  const projects = data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Projects"
        description="Every delivery you can open, with its schedule health."
        actions={
          capabilities.createProject && (
            <Button variant="primary" onClick={() => setCreateOpen(true)} leading={<IconPlus />}>
              New project
            </Button>
          )
        }
      />

      <div className="p-4 sm:p-6">
        {error ? (
          <ErrorState
            description="The project list could not be loaded."
            action={<Button onClick={() => void refetch()}>Try again</Button>}
          />
        ) : isLoading ? (
          <LoadingState label="Loading projects" />
        ) : projects.length === 0 ? (
          <div className="rounded-panel border border-rule bg-surface">
            <EmptyState
              title={search || status !== "all" ? "Nothing matches those filters" : "No projects yet"}
              description={
                search || status !== "all"
                  ? "Clear the search or pick another status to see the rest."
                  : "A project holds the tasks, the schedule, and the review trail for one delivery."
              }
              action={
                capabilities.createProject ? (
                  <Button variant="primary" onClick={() => setCreateOpen(true)}>
                    Create the first project
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded-panel border border-rule bg-surface">
            <ul className="divide-y divide-rule">
              {projects.map((project) => {
                const late =
                  project.baselinedEndDate !== null &&
                  project.targetLaunchDate !== null &&
                  project.baselinedEndDate > project.targetLaunchDate;

                return (
                  <li key={project.id}>
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: project.id }}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-3 transition-colors hover:bg-sunk sm:h-(--row-height) sm:py-0"
                    >
                      <span className="tnum w-16 shrink-0 font-mono text-meta text-ink-muted">
                        {project.code}
                      </span>

                      <span className="min-w-0 flex-1 basis-48">
                        <span className="block truncate text-compact font-medium text-ink">
                          {project.name}
                        </span>
                        <span className="block truncate text-meta text-ink-muted sm:hidden">
                          {project.ownerName ?? "Unassigned"} · {project.openTaskCount} open
                        </span>
                      </span>

                      <ProjectStatusLabel status={project.status} className="hidden sm:inline-flex" />

                      <span className="tnum hidden w-24 shrink-0 text-right text-meta text-ink-muted sm:block">
                        {project.openTaskCount}/{project.taskCount} open
                      </span>

                      <span className="tnum w-28 shrink-0 text-right text-meta">
                        <span className={late ? "text-danger" : "text-ink-muted"}>
                          {project.baselinedEndDate ? formatDate(project.baselinedEndDate) : "Not scheduled"}
                        </span>
                        <span className="block text-label text-faint">
                          {formatVariance(
                            project.baselinedEndDate && project.targetLaunchDate
                              ? Math.max(
                                  0,
                                  Math.round(
                                    (Date.parse(project.baselinedEndDate) -
                                      Date.parse(project.targetLaunchDate)) /
                                      86_400_000,
                                  ),
                                )
                              : null,
                          )}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="relative">
            <IconSearch className="pointer-events-none absolute top-2 left-2 text-faint" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or code"
              aria-label="Search projects"
              className="h-8 w-64 rounded-control border border-input bg-surface pr-2 pl-7 text-compact outline-none placeholder:text-faint focus-visible:border-ring"
            />
          </div>

          <div className="flex gap-1" role="group" aria-label="Filter by status">
            {STATUS_FILTERS.map((value) => (
              <Button
                key={value}
                size="sm"
                variant={status === value ? "primary" : "secondary"}
                onClick={() => setStatus(value)}
              >
                {value === "all" ? "All" : PROJECT_STATUS_LABEL[value as ProjectStatus]}
              </Button>
            ))}
          </div>

          {data && data.total > projects.length && (
            <span className="text-meta text-ink-muted">
              Showing {projects.length} of {data.total}
            </span>
          )}
        </div>
      </div>

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}

function CreateProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateProject();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kickoffDate, setKickoffDate] = useState("");
  const [leadTimeDays, setLeadTimeDays] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("draft");
  const [clientError, setClientError] = useState<string | null>(null);

  const close = () => {
    onOpenChange(false);
    setName("");
    setDescription("");
    setKickoffDate("");
    setLeadTimeDays("");
    setClientError(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (name.trim().length < 2) {
      setClientError("Give the project a name of at least two characters.");
      return;
    }

    try {
      await create.mutateAsync({
        name: name.trim(),
        description: description.trim() || null,
        status,
        kickoffDate: kickoffDate || null,
        leadTimeDays: leadTimeDays ? Number.parseInt(leadTimeDays, 10) : null,
      });
      close();
    } catch {
      // The mutation already surfaced the server's words as a toast.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            A code is generated for you. You can set the target launch date now or leave it until the
            schedule has run.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3" noValidate>
          <TextField
            label="Project name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            error={clientError}
          />

          <TextArea
            label="What is this delivery?"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            hint="One or two sentences. This is what people read before opening the plan."
          />

          <div className="grid grid-cols-2 gap-3">
            <DateField
              label="Kickoff date"
              value={kickoffDate}
              onChange={(event) => setKickoffDate(event.target.value)}
            />
            <NumberField
              label="Lead time"
              value={leadTimeDays}
              onChange={(event) => setLeadTimeDays(event.target.value)}
              suffix="days"
              hint="Kickoff plus this sets the launch date."
            />
          </div>

          <SelectField
            label="Status"
            value={status}
            onChange={(event) => setStatus(event.target.value as ProjectStatus)}
          >
            {(Object.keys(PROJECT_STATUS_LABEL) as ProjectStatus[]).map((value) => (
              <option key={value} value={value}>
                {PROJECT_STATUS_LABEL[value]}
              </option>
            ))}
          </SelectField>

          <DialogFooter>
            <Button type="button" variant="quiet" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={create.isPending}>
              {create.isPending ? "Creating" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
