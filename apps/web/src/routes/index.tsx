import { Link } from "@tanstack/react-router";
import { useOverview, useMyWork, useUpcoming } from "@/features/hooks";
import { useRequiredSession } from "@/features/session";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Figure, LoadingState, EmptyState, ErrorState, PageHeader } from "@/components/ui/surface";
import { StatusLabel } from "@/components/ui/status";
import { IconArrowRight, IconOverdue } from "@/components/icon";
import { formatDate, formatShortDate } from "@/lib/format";
import { countLabel } from "@zerotask/domain";
import type { TaskStatus } from "@zerotask/domain";

/**
 * The landing page: what needs me, what is late, and where the portfolio stands.
 *
 * It is a list of questions a delivery lead asks on opening the app, not a grid of
 * metric cards. Every figure's label states the rule that produced it, and every
 * figure links to the page where the work behind it lives.
 */
export default function OverviewPage() {
  const { person } = useRequiredSession();
  const { data: overview, isLoading, error, refetch } = useOverview();
  const { data: myWork, isError: myWorkError, refetch: refetchMyWork } = useMyWork();
  const { data: upcoming, isError: upcomingError, refetch: refetchUpcoming } = useUpcoming(7);

  const greeting = (
    <p className="mt-1 text-compact text-ink-muted">
      Signed in as {person.name ?? person.email}. Here is the week as it stands.
    </p>
  );

  if (error) {
    return (
      <><PageHeader title="Overview" description={greeting} />
        <ErrorState description="We couldn't load your overview. Check your connection and try again." action={<Button onClick={() => void refetch()}>Try again</Button>} />
      </>
    );
  }

  if (isLoading || !overview) {
    return (
      <><PageHeader title="Overview" description={greeting} /><LoadingState label="Loading overview" /></>
    );
  }

  return (
    <>
      <PageHeader
        title="Overview"
        description={greeting}
        meta={
          <>
            <span className="text-meta text-ink-muted">
              {countLabel(overview.projects.active, "active project")}
            </span>
            {overview.projects.atRisk > 0 && (
              <span className="inline-flex items-center gap-1 text-meta text-danger">
                <IconOverdue />
                {/* Agreeing only the noun left "1 project past their target"; the
                    possessive has to follow the number too. */}
                {overview.projects.atRisk === 1
                  ? "1 project past its target date"
                  : `${overview.projects.atRisk} projects past their target date`}
              </span>
            )}
          </>
        }
      />

      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-3">
        {/* Column 1: the person's own work, which is what they act on first. */}
        <section className="flex flex-col gap-4" aria-label="Your work">
          <Card>
            <CardHeader title="Needs your decision" description="Submissions waiting on you as a reviewer" />
            <CardContent>
              <Figure
                value={overview.reviews.pendingForMe}
                label={overview.reviews.pendingForMe === 1 ? "submission to review" : "submissions to review"}
                tone={overview.reviews.pendingForMe > 0 ? "caution" : "default"}
                emphasis
              />
              <Button asChild variant="quiet" size="sm" className="mt-2 -ml-2">
                <Link to="/reviews">
                  Open the review queue
                  <IconArrowRight size={12} />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Your dates" description="From tasks assigned to you that are still open" />
            <CardContent className="grid grid-cols-3 gap-3">
              <Figure
                value={overview.myTasks.overdue}
                label="Overdue"
                tone={overview.myTasks.overdue > 0 ? "danger" : "default"}
              />
              <Figure value={overview.myTasks.dueToday} label="Due today" />
              <Figure value={overview.myTasks.dueThisWeek} label="Due in 7 days" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              title="Next up"
              description="The soonest open work assigned to you"
              action={
                <Button asChild variant="quiet" size="sm">
                  <Link to="/my-work">
                    All
                    <IconArrowRight size={12} />
                  </Link>
                </Button>
              }
            />
            {upcomingError ? (
              <ErrorState description="We couldn't load your upcoming tasks." action={<Button size="sm" onClick={() => void refetchUpcoming()}>Try again</Button>} />
            ) : upcoming === undefined ? (
              <LoadingState label="Loading your tasks" />
            ) : upcoming.length === 0 ? (
              <EmptyState
                compact
                title="Nothing scheduled in the next week"
                description="Tasks assigned to you with a date in the coming seven days appear here."
              />
            ) : (
              <ul className="divide-y divide-rule">
                {upcoming.slice(0, 6).map((task) => (
                  <li key={task.id}>
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: task.projectId }}
                      className="flex h-(--row-height) items-center gap-2 px-3 transition-colors hover:bg-sunk"
                    >
                      <span className="tnum w-20 shrink-0 font-mono text-meta text-ink-muted">
                        {task.code}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-compact text-ink">{task.name}</span>
                      <span className="tnum shrink-0 text-meta text-ink-muted">
                        {formatShortDate(task.plannedEndDate ?? task.earlyFinish)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>

        {/* Column 2: the portfolio's health. */}
        <section className="flex flex-col gap-4 lg:col-span-2" aria-label="Delivery health">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-3">
                <Figure
                  value={overview.projects.atRisk}
                  label="project past its target"
                  plural="projects past their target"
                  hint="Computed end date is later than the target launch date"
                  tone={overview.projects.atRisk > 0 ? "danger" : "settled"}
                  emphasis
                />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-3">
                <Figure
                  value={overview.tasks.blocked}
                  label="blocked task"
                  plural="blocked tasks"
                  hint="Someone is waiting on another piece of work"
                  tone={overview.tasks.blocked > 0 ? "caution" : "settled"}
                  emphasis
                />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-3">
                <Figure
                  value={overview.tasks.overdue}
                  label="overdue task"
                  plural="overdue tasks"
                  hint="Open tasks whose date has passed"
                  tone={overview.tasks.overdue > 0 ? "danger" : "settled"}
                  emphasis
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader
              title="Work in motion"
              description="Open tasks across your projects, by status"
              action={
                <Button asChild variant="quiet" size="sm">
                  <Link to="/projects">
                    Projects
                    <IconArrowRight size={12} />
                  </Link>
                </Button>
              }
            />
            <CardContent>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Figure value={overview.tasks.inProgress} label="In progress" tone="accent" />
                <Figure value={overview.tasks.awaitingReview} label="Awaiting review" tone="caution" />
                <Figure value={overview.tasks.completedThisWeek} label="Completed this week" tone="settled" />
                <Figure value={overview.tasks.open} label="Open in total" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              title="Your board"
              description="Everything assigned to you, grouped the way the board groups it"
            />
            {myWorkError ? (
              <ErrorState description="We couldn't load your assigned work." action={<Button size="sm" onClick={() => void refetchMyWork()}>Try again</Button>} />
            ) : myWork === undefined ? (
              <LoadingState label="Loading your board" />
            ) : myWork.items.length === 0 ? (
              <EmptyState
                title="No open work assigned to you"
                description="When a task is assigned to you it appears here, ordered by its date."
                action={
                  <Button asChild variant="secondary" size="sm">
                    <Link to="/projects">Browse projects</Link>
                  </Button>
                }
              />
            ) : (
              <div className="divide-y divide-rule">
                {(["blocked", "in_progress", "pending_review", "not_started"] as TaskStatus[])
                  .map((status) => ({
                    status,
                    tasks: myWork.items.filter((task) => task.status === status),
                  }))
                  .filter((group) => group.tasks.length > 0)
                  .map((group) => (
                    <div key={group.status} className="px-3 py-2.5">
                      <div className="mb-1.5 flex items-center justify-between">
                        <StatusLabel status={group.status} />
                        <span className="tnum text-meta text-ink-muted">{group.tasks.length}</span>
                      </div>
                      <ul>
                        {group.tasks.slice(0, 4).map((task) => (
                          <li key={task.id} className="flex h-7 items-center gap-2">
                            <span className="tnum w-20 shrink-0 font-mono text-meta text-ink-muted">
                              {task.code}
                            </span>
                            <Link
                              to="/projects/$projectId"
                              params={{ projectId: task.projectId }}
                              className="min-w-0 flex-1 truncate text-compact text-ink hover:text-accent-ink hover:underline"
                            >
                              {task.name}
                            </Link>
                            <span className="hidden shrink-0 text-meta text-ink-muted sm:block">
                              {task.projectCode}
                            </span>
                            <span
                              className={dateCellClass(task.plannedEndDate, task.status)}
                              title={formatDate(task.plannedEndDate ?? task.earlyFinish)}
                            >
                              {formatShortDate(task.plannedEndDate ?? task.earlyFinish)}
                            </span>
                          </li>
                        ))}
                        {group.tasks.length > 4 && (
                          <li className="text-meta text-ink-muted">
                            and {group.tasks.length - 4} more
                          </li>
                        )}
                      </ul>
                    </div>
                  ))}
              </div>
            )}
          </Card>
        </section>
      </div>
    </>
  );
}

function dateCellClass(date: string | null, status: string): string {
  const late =
    date !== null && date < new Date().toISOString().slice(0, 10) && status !== "completed";
  return late
    ? "tnum shrink-0 text-meta text-danger"
    : "tnum shrink-0 text-meta text-ink-muted";
}
