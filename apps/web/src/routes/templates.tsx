import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTemplates, useTemplateActions, useTemplate, useProjects } from "@/features/hooks";
import { useRequiredSession } from "@/features/session";
import { Button, IconButton } from "@/components/ui/button";
import { DateField, SelectField, TextArea, TextField } from "@/components/ui/field";
import { CONTROL, Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, ErrorState, Figure, LoadingState, PageHeader } from "@/components/ui/surface";
import { ConfirmDialog } from "@/components/ui/confirm";
import { IconPlus, IconTrash } from "@/components/icon";
import { cn } from "@/lib/utils";
import { PRIORITY_LABEL, TASK_PRIORITIES } from "@zerotask/domain";
import type { TaskPriority } from "@zerotask/domain";

/**
 * Templates: the shapes of deliveries, ready to stamp.
 *
 * An admin maintains them; anyone who can create a project can instantiate one.
 * The card shows the shape's weight, task count and total duration, because that is
 * what makes a template worth reaching for instead of starting from nothing.
 *
 * A template is built one of two ways, and the difference is worth knowing before
 * clicking: written from scratch (tasks and their edges declared here), or captured
 * from a project that already ran — the second is how an existing plan becomes
 * reusable, and it is the only way to get a shape out of work that already exists.
 */
export default function TemplatesPage() {
  const { capabilities } = useRequiredSession();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useTemplates();
  const { remove, instantiate } = useTemplateActions();

  const [instantiating, setInstantiating] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; label: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const templates = data ?? [];

  return (
    <>
      <PageHeader
        title="Templates"
        description="Reusable delivery shapes. Instantiating one creates a project with its tasks and dependency graph already in place."
        actions={
          capabilities.manageTemplates && (
            <>
              <Button variant="secondary" onClick={() => setCapturing(true)}>
                Capture a project
              </Button>
              <Button variant="primary" leading={<IconPlus />} onClick={() => setCreating(true)}>
                New template
              </Button>
            </>
          )
        }
      />

      <div className="p-4 sm:p-6">
        {error ? (
          <ErrorState
            description="The templates could not be loaded. An empty list and a failed request look the same on screen, so nothing is reported as 'no templates' until the request succeeds."
            action={<Button onClick={() => void refetch()}>Try again</Button>}
          />
        ) : isLoading ? (
          <LoadingState label="Loading templates" />
        ) : templates.length === 0 ? (
          <div className="rounded-panel border border-rule bg-surface">
            <EmptyState
              title="No templates yet"
              description="A template is the shape of the work: tasks, durations, and how they depend on each other. Write one from scratch, or capture a project that already has the plan you want to repeat."
              action={
                capabilities.manageTemplates ? (
                  <div className="flex flex-wrap gap-1.5">
                    <Button variant="primary" leading={<IconPlus />} onClick={() => setCreating(true)}>
                      New template
                    </Button>
                    <Button variant="secondary" onClick={() => setCapturing(true)}>
                      Capture a project
                    </Button>
                  </div>
                ) : undefined
              }
            />
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {templates.map((template) => (
              <li key={template.id} className="flex flex-col rounded-panel border border-rule bg-surface">
                <div className="flex-1 px-3 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="text-compact font-semibold text-ink">{template.name}</h2>
                    <span className="tnum font-mono text-label text-faint">{template.code}</span>
                  </div>
                  {template.description && (
                    <p className="mt-1 line-clamp-2 text-meta text-ink-muted">{template.description}</p>
                  )}
                  <div className="mt-3 flex gap-5">
                    <Figure value={template.taskCount} label="task" plural="tasks" />
                    <Figure value={`${template.totalDurationDays}d`} label="total duration" />
                    <Figure value={template.usageCount} label="project stamped" plural="projects stamped" />
                  </div>
                </div>

                <div className="flex items-center gap-1.5 border-t border-rule px-3 py-2">
                  <span className="rounded-mark bg-sunk px-1.5 py-0.5 text-label text-ink-muted">
                    {template.category}
                  </span>
                  <span className="flex-1" />
                  {capabilities.createProject && (
                    <Button variant="primary" size="sm" onClick={() => setInstantiating(template.id)}>
                      Create project
                    </Button>
                  )}
                  {capabilities.manageTemplates && (
                    <Button
                      variant="quiet"
                      size="sm"
                      onClick={() => setDeleting({ id: template.id, label: template.name })}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Mounted only while open: a closed dialog has no reason to fetch its project
          list, and starting from a clean form is what closing it should mean. */}
      {creating && <CreateTemplateDialog onClose={() => setCreating(false)} />}

      {capturing && <CaptureProjectDialog onClose={() => setCapturing(false)} />}

      <InstantiateDialog
        templateId={instantiating}
        onClose={() => setInstantiating(null)}
        onCreated={(created) => void navigate({ to: "/projects/$projectId", params: { projectId: created.id } })}
        instantiate={instantiate}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this template?"
        description={
          deleting
            ? `${deleting.label} stops being available to stamp new projects from. Projects already created from it are unaffected. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete template"
        pending={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
          setDeleting(null);
        }}
      />
    </>
  );
}

/* --- Writing a template from nothing ---------------------------------------- */

/** A row as it is typed, before it becomes a template task with a code. */
interface DraftTask {
  /** Stable identity for the row, so a predecessor choice survives a row above being deleted. */
  key: string;
  name: string;
  durationDays: string;
  priority: TaskPriority;
  /** The row this one waits for, by row key. Empty means it starts freely. */
  predecessorKey: string;
}

const blankTask = (key: string): DraftTask => ({
  key,
  name: "",
  durationDays: "1",
  priority: "medium",
  predecessorKey: "",
});

/** Task codes are positional, which is what the API resolves dependencies against. */
const taskCode = (index: number) => `T-${String(index + 1).padStart(2, "0")}`;

/**
 * Would row `taskKey` waiting on row `candidateKey` close a loop?
 *
 * The template's dependency graph is written once and then reused, so a cycle in
 * it would break every project stamped from it, not just one. Following the
 * candidate's own chain of "waits for" back to the row being edited is the whole
 * check: reach it and the edge would be the last link of a circle.
 */
function wouldCycle(rows: DraftTask[], taskKey: string, candidateKey: string): boolean {
  const seen = new Set<string>();
  let cursor: string | undefined = candidateKey;

  while (cursor) {
    if (cursor === taskKey) return true;
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    cursor = rows.find((row) => row.key === cursor)?.predecessorKey || undefined;
  }

  return false;
}

const ROW = "grid gap-2 px-2 py-2 sm:grid-cols-[minmax(0,1fr)_4.5rem_7rem_8.5rem_1.75rem] sm:items-center";

function CreateTemplateDialog({ onClose }: { onClose: () => void }) {
  const { create } = useTemplateActions();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [tasks, setTasks] = useState<DraftTask[]>(() => [blankTask("t1")]);
  const [nextKey, setNextKey] = useState(2);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (!create.isPending) onClose();
  };

  const patch = (key: string, next: Partial<DraftTask>) =>
    setTasks((rows) => rows.map((row) => (row.key === key ? { ...row, ...next } : row)));

  const removeTask = (key: string) =>
    setTasks((rows) =>
      rows
        .filter((row) => row.key !== key)
        // A row that waited on the removed one must not keep pointing at a code
        // that no longer exists.
        .map((row) => (row.predecessorKey === key ? { ...row, predecessorKey: "" } : row)),
    );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (name.trim().length < 2) {
      setError("Give the template a name of at least two characters.");
      return;
    }
    if (tasks.length === 0) {
      setError("Add at least one task. A template with no tasks cannot stamp a project.");
      return;
    }
    const unnamed = tasks.findIndex((task) => task.name.trim().length < 2);
    if (unnamed >= 0) {
      setError(`Task ${unnamed + 1} needs a name of at least two characters.`);
      return;
    }

    setError(null);

    try {
      await create.mutateAsync({
        name: name.trim(),
        description: description.trim() || null,
        category: category.trim() || undefined,
        tasks: tasks.map((task, index) => ({
          code: taskCode(index),
          name: task.name.trim(),
          durationDays: Math.min(3650, Math.max(1, Number.parseInt(task.durationDays, 10) || 1)),
          priority: task.priority,
        })),
        dependencies: tasks.flatMap((task, index) => {
          const from = tasks.findIndex((row) => row.key === task.predecessorKey);
          if (from < 0) return [];
          return [{ predecessorCode: taskCode(from), successorCode: taskCode(index), type: "fs" as const, lagDays: 0 }];
        }),
      });
      close();
    } catch {
      // The mutation already surfaced the server's words as a toast.
    }
  };

  return (
    <Dialog open onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New template</DialogTitle>
          <DialogDescription>
            Declare the shape once: each task's duration, and the task it waits for. Stamping this
            template creates those tasks with the same edges between them.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3" noValidate>
          <TextField
            label="Template name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={120}
          />

          <TextArea
            label="What shape is this?"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={1000}
            rows={2}
            hint="One sentence. It is copied into every project stamped from this template."
          />

          <TextField
            label="Category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            maxLength={40}
            hint="Groups the card in the list, e.g. operations or compliance."
          />

          <div className="flex flex-col gap-1">
            <span className="text-meta font-medium text-ink">Tasks</span>

            <div className="rounded-control border border-rule">
              <div
                aria-hidden="true"
                className={cn(
                  ROW,
                  "hidden border-b border-rule bg-sunk py-1.5 text-label text-ink-muted sm:grid",
                )}
              >
                <span>Task</span>
                <span>Days</span>
                <span>Priority</span>
                <span>Waits for</span>
                <span />
              </div>

              <ul className="divide-y divide-rule">
                {tasks.map((task, index) => (
                  <li key={task.key} className={ROW}>
                    <Input
                      aria-label={`Task ${index + 1}: name`}
                      value={task.name}
                      maxLength={200}
                      placeholder="e.g. Site survey and racking layout"
                      onChange={(event) => patch(task.key, { name: event.target.value })}
                    />
                    <Input
                      aria-label={`Task ${index + 1}: duration in days`}
                      type="number"
                      min={1}
                      max={3650}
                      step={1}
                      value={task.durationDays}
                      onChange={(event) => patch(task.key, { durationDays: event.target.value })}
                      className="tnum"
                    />
                    <select
                      aria-label={`Task ${index + 1}: priority`}
                      value={task.priority}
                      onChange={(event) => patch(task.key, { priority: event.target.value as TaskPriority })}
                      className={cn(CONTROL, "h-8")}
                    >
                      {TASK_PRIORITIES.map((priority) => (
                        <option key={priority} value={priority}>
                          {PRIORITY_LABEL[priority]}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={`Task ${index + 1}: waits for`}
                      value={task.predecessorKey}
                      onChange={(event) => patch(task.key, { predecessorKey: event.target.value })}
                      className={cn(CONTROL, "h-8")}
                    >
                      <option value="">Starts freely</option>
                      {tasks
                        .map((other, otherIndex) => ({ other, otherIndex }))
                        .filter(
                          ({ other }) =>
                            other.key !== task.key && !wouldCycle(tasks, task.key, other.key),
                        )
                        .map(({ other, otherIndex }) => (
                          <option key={other.key} value={other.key}>
                            {taskCode(otherIndex)} {other.name.trim() || "untitled"}
                          </option>
                        ))}
                    </select>
                    <IconButton
                      label={`Remove task ${index + 1}`}
                      variant="danger"
                      onClick={() => removeTask(task.key)}
                    >
                      <IconTrash size={14} />
                    </IconButton>
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rule px-2 py-2">
                <Button
                  variant="secondary"
                  size="sm"
                  leading={<IconPlus />}
                  onClick={() => {
                    setTasks((rows) => [...rows, blankTask(`t${nextKey}`)]);
                    setNextKey((value) => value + 1);
                  }}
                >
                  Add task
                </Button>
                <span className="tnum text-label text-ink-muted">
                  {tasks.length === 0
                    ? "No tasks yet"
                    : `${tasks.length} task${tasks.length === 1 ? "" : "s"}, ${tasks.reduce(
                        (total, task) => total + (Number.parseInt(task.durationDays, 10) || 0),
                        0,
                      )}d in total`}
                </span>
              </div>
            </div>

            {error ? (
              <p className="text-meta text-danger">{error}</p>
            ) : (
              <p className="text-meta text-ink-muted">
                "Waits for" makes the edge finish-to-start with no lag. Codes are assigned in this
                order.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="quiet" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={create.isPending}>
              {create.isPending ? "Saving" : "Save template"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* --- Duplicating a project's plan into a template --------------------------- */

/**
 * Capture reads a project's live tasks and edges and writes them as a template.
 * Assignees and dates stay behind, because they belong to that run of the work and
 * not to its shape — the whole point of reusing it is that the next run differs.
 */
function CaptureProjectDialog({ onClose }: { onClose: () => void }) {
  const { capture } = useTemplateActions();
  const { data, isLoading, error: projectsError, refetch } = useProjects({});
  const projects = data?.items ?? [];

  const [projectId, setProjectId] = useState("");
  const [name, setName] = useState("");
  /** Once the name is typed, choosing another project must not overwrite it. */
  const [nameEdited, setNameEdited] = useState(false);
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (!capture.isPending) onClose();
  };

  const chosen = projects.find((project) => project.id === projectId);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!projectId) {
      setError("Pick the project to copy the shape from.");
      return;
    }
    if (name.trim().length < 2) {
      setError("Give the template a name of at least two characters.");
      return;
    }

    setError(null);

    try {
      await capture.mutateAsync({
        projectId,
        name: name.trim(),
        category: category.trim() || undefined,
      });
      close();
    } catch {
      // The toast carries the server's reason, e.g. a project with no tasks.
    }
  };

  return (
    <Dialog open onOpenChange={(next) => !next && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Capture a project as a template</DialogTitle>
          <DialogDescription>
            Its tasks, durations and dependencies are copied into a new template. Assignees, dates
            and progress are not: they belong to that run, not to the shape.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3" noValidate>
          {projectsError ? (
            <ErrorState
              title="No project list"
              description="The projects could not be loaded, so there is nothing to pick from."
              action={<Button onClick={() => void refetch()}>Try again</Button>}
            />
          ) : (
            <SelectField
              label="Source project"
              value={projectId}
              disabled={isLoading}
              onChange={(event) => {
                const nextId = event.target.value;
                setProjectId(nextId);
                if (!nameEdited) {
                  setName(projects.find((project) => project.id === nextId)?.name ?? "");
                }
              }}
              hint={
                isLoading
                  ? "Loading projects."
                  : chosen
                    ? `${chosen.taskCount} task${chosen.taskCount === 1 ? "" : "s"} will be copied.`
                    : "Only the plan is read; the project itself is untouched."
              }
            >
              <option value="">{isLoading ? "Loading projects." : "Choose a project"}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.code} · {project.name}
                </option>
              ))}
            </SelectField>
          )}

          <TextField
            label="Template name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setNameEdited(true);
            }}
            required
            maxLength={120}
            hint="Defaults to the project's name."
          />

          <TextField
            label="Category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            maxLength={40}
            placeholder="general"
            hint="Groups the card in the list."
          />

          {error && <p className="text-meta text-danger">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="quiet" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={capture.isPending || !projectId}>
              {capture.isPending ? "Capturing" : "Save as template"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* --- Stamping one ---------------------------------------------------------- */

function InstantiateDialog({
  templateId,
  onClose,
  onCreated,
  instantiate,
}: {
  templateId: string | null;
  onClose: () => void;
  onCreated: (created: { id: string; code: string; name: string }) => void;
  instantiate: ReturnType<typeof useTemplateActions>["instantiate"];
}) {
  const { data: template } = useTemplate(templateId ?? undefined);

  const [name, setName] = useState("");
  const [kickoffDate, setKickoffDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setName("");
    setError(null);
    onClose();
  };

  return (
    <Dialog open={templateId !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a project from {template?.name ?? "template"}</DialogTitle>
          <DialogDescription>
            {template
              ? "Its tasks and their dependency graph are copied in. Assignees and dates are not: they belong to the project, not the shape."
              : "Loading the template."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim().length < 2 || !templateId) {
              setError("Give the project a name of at least two characters.");
              return;
            }
            instantiate
              .mutateAsync({ id: templateId, name: name.trim(), kickoffDate: kickoffDate || null })
              .then(onCreated)
              .catch(() => setError("That did not work. The name may already be taken."));
          }}
          className="flex flex-col gap-3"
          noValidate
        >
          <TextField
            label="Project name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            error={error}
          />
          <DateField
            label="Kickoff date"
            value={kickoffDate}
            onChange={(event) => setKickoffDate(event.target.value)}
          />

          <DialogFooter>
            <Button type="button" variant="quiet" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={instantiate.isPending}>
              {instantiate.isPending ? "Creating" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
