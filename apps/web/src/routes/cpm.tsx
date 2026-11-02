import { Link } from "@tanstack/react-router";
import { usePortfolio } from "@/features/hooks";
import { Button } from "@/components/ui/button";
import { EmptyState, Figure, LoadingState, PageHeader } from "@/components/ui/surface";
import { IconOverdue } from "@/components/icon";
import { formatDate } from "@/lib/format";

/**
 * Critical path across the portfolio.
 *
 * One row per project with the numbers that say whether the plan is honest: how
 * many tasks sit on the critical path with zero float, how many are blocked, and
 * whether the computed finish is past the target. The per-project Gantt lives on
 * the project page; this page answers "which project do I open first".
 */
export default function CpmPage() {
  const { data, isLoading } = usePortfolio();

  const rows = data ?? [];
  const late = rows.filter(
    (row) => row.baselinedEndDate && row.targetLaunchDate && row.baselinedEndDate > row.targetLaunchDate,
  );
  const totals = rows.reduce(
    (sum, row) => ({
      tasks: sum.tasks + row.taskCount,
      critical: sum.critical + row.criticalCount,
      blocked: sum.blocked + row.blockedCount,
      overdue: sum.overdue + row.overdueCount,
    }),
    { tasks: 0, critical: 0, blocked: 0, overdue: 0 },
  );

  return (
    <>
      <PageHeader
        title="Critical path"
        description="Schedule health across every project you can open. A project with critical tasks is one where a delay anywhere moves the finish."
        meta={
          rows.length > 0 ? (
            <>
              <Figure value={totals.tasks} label="tasks scheduled" />
              <Figure value={totals.critical} label="on critical paths" tone={totals.critical > 0 ? "danger" : "settled"} />
              <Figure value={totals.blocked} label="blocked" tone={totals.blocked > 0 ? "caution" : "settled"} />
              <Figure value={totals.overdue} label="overdue" tone={totals.overdue > 0 ? "danger" : "settled"} />
            </>
          ) : undefined
        }
      />

      <div className="p-4 sm:p-6">
        {isLoading ? (
          <LoadingState label="Loading the portfolio" />
        ) : rows.length === 0 ? (
          <div className="rounded-panel border border-rule bg-surface">
            <EmptyState
              title="Nothing scheduled yet"
              description="Run the schedule on a project with tasks, and its critical path shows up here."
              action={
                <Button asChild variant="secondary" size="sm">
                  <Link to="/projects">Go to projects</Link>
                </Button>
              }
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded-panel border border-rule bg-surface">
            <table className="w-full text-left">
              <caption className="sr-only">Schedule health per project</caption>
              <thead>
                <tr className="border-b border-rule bg-sunk text-label font-medium text-ink-muted">
                  <th scope="col" className="px-3 py-2">Project</th>
                  <th scope="col" className="px-3 py-2 text-right">Tasks</th>
                  <th scope="col" className="px-3 py-2 text-right">Critical</th>
                  <th scope="col" className="hidden px-3 py-2 text-right sm:table-cell">Blocked</th>
                  <th scope="col" className="hidden px-3 py-2 text-right sm:table-cell">Overdue</th>
                  <th scope="col" className="hidden px-3 py-2 text-right md:table-cell">Computed finish</th>
                  <th scope="col" className="px-3 py-2 text-right">Target</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {rows.map((row) => {
                  const isLate =
                    row.baselinedEndDate !== null &&
                    row.targetLaunchDate !== null &&
                    row.baselinedEndDate > row.targetLaunchDate;

                  return (
                    <tr key={row.id} className="h-(--row-height) transition-colors hover:bg-sunk">
                      <td className="px-3">
                        <Link
                          to="/projects/$projectId"
                          params={{ projectId: row.id }}
                          className="group flex items-baseline gap-2"
                        >
                          <span className="tnum font-mono text-meta text-ink-muted">{row.code}</span>
                          <span className="truncate text-compact font-medium text-ink group-hover:text-accent-ink group-hover:underline">
                            {row.name}
                          </span>
                        </Link>
                      </td>
                      <td className="tnum px-3 text-right text-compact text-ink-muted">{row.taskCount}</td>
                      <td className="tnum px-3 text-right">
                        <span className={row.criticalCount > 0 ? "font-medium text-danger" : "text-ink-muted"}>
                          {row.criticalCount}
                        </span>
                      </td>
                      <td className="tnum hidden px-3 text-right sm:table-cell">
                        <span className={row.blockedCount > 0 ? "text-caution" : "text-ink-muted"}>
                          {row.blockedCount}
                        </span>
                      </td>
                      <td className="tnum hidden px-3 text-right sm:table-cell">
                        <span className={row.overdueCount > 0 ? "text-danger" : "text-ink-muted"}>
                          {row.overdueCount}
                        </span>
                      </td>
                      <td className="tnum hidden px-3 text-right text-ink-muted md:table-cell">
                        {row.baselinedEndDate ? formatDate(row.baselinedEndDate) : "Not run"}
                      </td>
                      <td className="tnum px-3 text-right">
                        {row.targetLaunchDate ? (
                          <span className={isLate ? "inline-flex items-center gap-1 text-danger" : "text-ink-muted"}>
                            {isLate && <IconOverdue size={12} />}
                            {formatDate(row.targetLaunchDate)}
                          </span>
                        ) : (
                          <span className="text-faint">Not set</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {late.length > 0 && (
              <p className="border-t border-rule px-3 py-2 text-meta text-ink-muted">
                {late.length} {late.length === 1 ? "project is" : "projects are"} scheduled to finish past
                the target launch date. The fix is either more float on the critical path or a moved
                target, and only one of those is in your control.
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
