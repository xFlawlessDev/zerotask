import { useState } from "react";
import { useWorkload, useDepartments } from "@/features/hooks";
import { addDaysIso, todayIso } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { EmptyState, Figure, LoadingState, PageHeader } from "@/components/ui/surface";
import { SelectField } from "@/components/ui/field";
import { formatHours } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Resources: who is carrying how much, over a fortnight.
 *
 * Utilisation is logged hours against the capacity the window actually contains,
 * counted in working days, capped at 200% so a data-entry mistake flattens nobody
 * else's bar. The bar marks 100%, not the edge, because the interesting question
 * is distance past full.
 */

const WINDOWS = [
  { label: "This week", days: 7 },
  { label: "Two weeks", days: 14 },
  { label: "Four weeks", days: 28 },
] as const;

export default function ResourcesPage() {
  const [windowDays, setWindowDays] = useState<(typeof WINDOWS)[number]["days"]>(14);
  const [departmentId, setDepartmentId] = useState<string>("all");

  const { data: departments } = useDepartments();

  const from = todayIso();
  const to = addDaysIso(from, windowDays);
  const { data, isLoading } = useWorkload(from, to, departmentId === "all" ? undefined : departmentId);

  const people = data?.people.filter((person) => person.openTasks > 0 || person.loggedHours > 0) ?? [];
  const overCommitted = people.filter((person) => person.utilisation > 100);

  return (
    <>
      <PageHeader
        title="Resources"
        description="Logged hours against capacity. This is what people actually did in the window, not what was estimated."
        meta={
          data ? (
            <>
              <Figure
                value={overCommitted.length}
                label="past 100% capacity"
                tone={overCommitted.length > 0 ? "danger" : "settled"}
              />
              <Figure value={data.window.weekdays} label="working days in window" />
            </>
          ) : undefined
        }
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex gap-1" role="group" aria-label="Window length">
              {WINDOWS.map((option) => (
                <Button
                  key={option.days}
                  size="sm"
                  variant={windowDays === option.days ? "primary" : "secondary"}
                  onClick={() => setWindowDays(option.days)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <div className="w-44">
              <SelectField
                label="Department"
                value={departmentId}
                onChange={(event) => setDepartmentId(event.target.value)}
              >
                <option value="all">All departments</option>
                {(departments ?? []).map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </SelectField>
            </div>
          </div>
        }
      />

      <div className="p-4 sm:p-6">
        {isLoading || !data ? (
          <LoadingState label="Loading workload" />
        ) : people.length === 0 ? (
          <div className="rounded-panel border border-rule bg-surface">
            <EmptyState
              title="No logged work in this window"
              description="Hours appear here once people log work against their tasks. Estimates are deliberately not shown: they are a wish, and the point of this page is what happened."
            />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="overflow-hidden rounded-panel border border-rule bg-surface">
              <table className="w-full text-left">
                <caption className="sr-only">Logged hours and utilisation per person</caption>
                <thead>
                  <tr className="border-b border-rule bg-sunk text-label font-medium text-ink-muted">
                    <th scope="col" className="px-3 py-2">Person</th>
                    <th scope="col" className="hidden px-3 py-2 sm:table-cell">Department</th>
                    <th scope="col" className="px-3 py-2 text-right">Open tasks</th>
                    <th scope="col" className="px-3 py-2 text-right">Logged</th>
                    <th scope="col" className="px-3 py-2 text-right">Utilisation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {people.map((person) => (
                    <tr key={person.userId} className="h-(--row-height) transition-colors hover:bg-sunk">
                      <td className="px-3 text-compact text-ink">{person.name ?? "Unknown"}</td>
                      <td className="hidden px-3 text-meta text-ink-muted sm:table-cell">
                        {person.departmentName ?? "No department"}
                      </td>
                      <td className="tnum px-3 text-right text-compact text-ink-muted">{person.openTasks}</td>
                      <td className="tnum px-3 text-right text-compact text-ink">{formatHours(person.loggedHours)}</td>
                      <td className="px-3">
                        <div className="flex items-center justify-end gap-2">
                          <span
                            className={cn(
                              "tnum w-10 text-right text-compact",
                              person.utilisation > 100 ? "font-medium text-danger" : "text-ink-muted",
                            )}
                          >
                            {person.utilisation}%
                          </span>
                          <span
                            className="relative h-2 w-24 shrink-0 overflow-hidden rounded-full bg-sunk"
                            role="img"
                            aria-label={`${person.utilisation}% of capacity`}
                          >
                            <span
                              className={cn(
                                "absolute inset-y-0 left-0 rounded-full",
                                person.utilisation > 100 ? "bg-danger" : "bg-accent-ink",
                              )}
                              style={{ width: `${Math.min(100, person.utilisation)}%` }}
                            />
                            {/* The 100% mark, visible on bars that pass it. */}
                            <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px bg-rule" />
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.departments.length > 0 && (
              <div className="rounded-panel border border-rule bg-surface">
                <div className="border-b border-rule px-3 py-2">
                  <h2 className="text-section font-semibold text-ink">By department</h2>
                </div>
                <ul className="divide-y divide-rule">
                  {data.departments.map((department) => (
                    <li key={department.departmentId} className="flex h-(--row-height) items-center gap-3 px-3">
                      <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: department.color }} />
                      <span className="min-w-0 flex-1 truncate text-compact text-ink">{department.name}</span>
                      <span className="tnum text-meta text-ink-muted">{department.headcount} people</span>
                      <span className="tnum w-16 text-right text-compact text-ink">{formatHours(department.loggedHours)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
