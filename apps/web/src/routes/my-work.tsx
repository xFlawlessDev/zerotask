import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMyWork, useMoveTask } from "@/features/hooks";
import { useRequiredSession } from "@/features/session";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Figure, LoadingState, PageHeader } from "@/components/ui/surface";
import { StatusLabel, PriorityLabel, Tag } from "@/components/ui/status";
import { IconWarning } from "@/components/icon";
import { formatShortDate, isOverdue, todayIso } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/api/types";
import type { TaskStatus } from "@zerotask/domain";

/**
 * My work: everything assigned to this person, as a board.
 *
 * Columns are the four statuses a person can move a task between. Completion is
 * deliberately not a column: finishing goes through a submission and a review, and
 * the board says so rather than offering a drag that would be refused.
 */

const COLUMNS: { status: TaskStatus; hint: string }[] = [
  { status: "blocked", hint: "Waiting on something else" },
  { status: "not_started", hint: "Picked up next" },
  { status: "in_progress", hint: "Being worked on now" },
  { status: "pending_review", hint: "Waiting for a reviewer" },
];

export default function MyWorkPage() {
  const { person } = useRequiredSession();
  const { data, isLoading, error, refetch } = useMyWork();
  const move = useMoveTask("");

  const [dragging, setDragging] = useState<Task | null>(null);

  const items = data?.items ?? [];
  const counts = data?.statusCounts ?? {};

  const grouped = COLUMNS.map((column) => ({
    ...column,
    tasks: items.filter((task) => task.status === column.status),
  }));
  const others = items.filter(
    (task) => task.status === "completed" || task.status === "cancelled",
  );

  const handleDrop = (status: TaskStatus) => {
    if (!dragging || dragging.status === status) return;
    if (status === "pending_review") return; // moves to review via a submission, not a drag
    move.mutate(
      { taskId: dragging.id, status: status as "not_started" | "in_progress" | "blocked" | "cancelled" },
      { onSuccess: () => setDragging(null) },
    );
  };

  return (
    <>
      <PageHeader
        title="My work"
        description={`Open tasks assigned to ${person.name ?? "you"}, newest deadline first.`}
        meta={
          <>
            <Figure value={counts.completed ?? 0} label="completed" tone="settled" />
            <Figure value={counts.in_progress ?? 0} label="in progress" tone="accent" />
            <Figure value={counts.blocked ?? 0} label="blocked" tone="danger" />
          </>
        }
      />

      <div className="p-4 sm:p-6">
        {error ? (
          <ErrorState
            description="Your work could not be loaded."
            action={<Button onClick={() => void refetch()}>Try again</Button>}
          />
        ) : isLoading ? (
          <LoadingState label="Loading your work" />
        ) : items.length === 0 ? (
          <div className="rounded-panel border border-rule bg-surface">
            <EmptyState
              title="Nothing is assigned to you"
              description="When a task is assigned to you it lands here, grouped by where it is in the workflow."
              action={
                <Button asChild variant="secondary" size="sm">
                  <Link to="/projects">Browse projects</Link>
                </Button>
              }
            />
          </div>
        ) : (
          <>
            <div
              className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
              onDragEnd={() => setDragging(null)}
            >
              {grouped.map((column) => (
                <section
                  key={column.status}
                  aria-label={`${column.hint}`}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => handleDrop(column.status)}
                  className="flex min-h-40 flex-col rounded-panel border border-rule bg-surface"
                >
                  <header className="flex items-center justify-between border-b border-rule px-3 py-2">
                    <StatusLabel status={column.status} />
                    <span className="tnum text-meta text-ink-muted">{column.tasks.length}</span>
                  </header>

                  <ul className="flex-1 space-y-1 p-1.5">
                    {column.tasks.length === 0 && (
                      <li className="px-2 py-3 text-meta text-faint">{column.hint}.</li>
                    )}
                    {column.tasks.map((task) => (
                      <li key={task.id}>
                        <div
                          draggable
                          onDragStart={() => setDragging(task)}
                          className={cn(
                            "cursor-grab rounded-control border border-rule bg-surface p-2 transition-colors hover:border-ink-muted active:cursor-grabbing",
                            isOverdue(task.plannedEndDate ?? task.earlyFinish, task.status) &&
                              "border-l-2 border-l-danger",
                          )}
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="tnum font-mono text-label text-ink-muted">{task.code}</span>
                            {isOverdue(task.plannedEndDate ?? task.earlyFinish, task.status) && (
                              <span className="inline-flex items-center gap-0.5 text-label text-danger">
                                <IconWarning size={11} />
                                overdue
                              </span>
                            )}
                          </div>

                          <p className="mt-0.5 text-compact leading-snug text-ink">{task.name}</p>

                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <PriorityLabel priority={task.priority} />
                            <span className="tnum text-label text-ink-muted">
                              {formatShortDate(task.plannedEndDate ?? task.earlyFinish)}
                            </span>
                          </div>

                          <div className="mt-1.5 flex items-center justify-between gap-1">
                            <Link
                              to="/projects/$projectId"
                              params={{ projectId: task.projectId }}
                              className="font-mono text-label text-accent-ink hover:underline"
                            >
                              {task.projectCode}
                            </Link>
                            {task.labels.slice(0, 2).map((label) => (
                              <Tag key={label.id} name={label.name} color={label.color} />
                            ))}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>

                  {column.status === "pending_review" && (
                    <footer className="border-t border-rule px-2 py-1.5 text-label text-faint">
                      Tasks leave this column when a reviewer decides.
                    </footer>
                  )}
                </section>
              ))}
            </div>

            {others.length > 0 && (
              <div className="mt-4">
                <h2 className="mb-1.5 text-meta font-medium text-ink-muted">Recently closed</h2>
                <ul className="overflow-hidden rounded-panel border border-rule bg-surface">
                  {others.map((task) => (
                    <li key={task.id} className="flex h-9 items-center gap-3 border-b border-rule px-3 last:border-b-0">
                      <span className="tnum w-24 font-mono text-meta text-faint">{task.code}</span>
                      <span className="min-w-0 flex-1 truncate text-compact text-ink-muted">{task.name}</span>
                      <StatusLabel status={task.status} />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="mt-4 text-meta text-ink-muted">
              Drag a card between columns to change its status. A task cannot be completed by dragging:
              submit it for review from the project page, and a reviewer decides. Today is{" "}
              <time dateTime={todayIso()} className="tnum">
                {formatShortDate(todayIso())}
              </time>
              .
            </p>
          </>
        )}
      </div>
    </>
  );
}

export { useMoveTask };
