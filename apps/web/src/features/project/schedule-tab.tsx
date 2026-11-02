import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Timeline } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingState, Figure } from "@/components/ui/surface";
import { IconRecalculate } from "@/components/icon";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The schedule tab: the Gantt, the numbers behind it, and the button that recomputes.
 *
 * The chart is the only chart in the planning area, because time is the one thing
 * here that is genuinely two-dimensional. Bars are drawn as absolutely positioned
 * divs rather than an SVG chart library: the data is a flat list of start/end
 * dates, and a dependency is a line between two bars, which is not what chart
 * libraries model.
 */
export function ScheduleTab({
  projectId,
  timeline,
}: {
  projectId: string;
  timeline: Timeline | undefined;
}) {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      await api.schedule.run(projectId);
      await queryClient.invalidateQueries({ queryKey: ["projects", projectId, "schedule"] });
      await queryClient.invalidateQueries({ queryKey: ["projects", projectId, "tasks"] });
      toast.success("Schedule recalculated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The schedule could not be recalculated");
    } finally {
      setRunning(false);
    }
  };

  if (timeline === undefined) return <LoadingState label="Loading the schedule" />;

  const { bars, links, range } = timeline;

  if (bars.length === 0 || range === null) {
    return (
      <div className="rounded-panel border border-rule bg-surface">
        <EmptyState
          title="Nothing to schedule yet"
          description="Add tasks with durations, then run the schedule. The critical path and the finish date come from that graph."
          action={
            bars.length > 0 ? (
              <Button variant="primary" onClick={() => void run()} disabled={running}>
                <IconRecalculate />
                {running ? "Recalculating" : "Run the schedule"}
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  const from = Date.parse(`${range.from}T00:00:00Z`);
  const to = Date.parse(`${range.to}T00:00:00Z`);
  const totalDays = Math.max(1, Math.round((to - from) / 86_400_000) + 1);

  const criticalCount = bars.filter((bar) => bar.isCritical).length;
  const projectFinish = range.to;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-6">
          <Figure value={bars.length} label="Tasks scheduled" />
          <Figure
            value={criticalCount}
            label="On the critical path"
            hint="Zero float: a delay here moves the finish"
            tone={criticalCount > 0 ? "danger" : "settled"}
          />
          <Figure value={formatShortDate(projectFinish)} label="Computed finish" tone="accent" />
        </div>
        <Button variant="secondary" onClick={() => void run()} disabled={running}>
          <IconRecalculate />
          {running ? "Recalculating" : "Recalculate"}
        </Button>
      </div>

      <div className="overflow-hidden rounded-panel border border-rule bg-surface">
        <div className="overflow-x-auto">
          <div className="min-w-max">
            {/* Week header, one column per working week. */}
            <div className="flex border-b border-rule bg-sunk">
              <div className="w-56 shrink-0 border-r border-rule px-3 py-1.5 text-label font-medium text-ink-muted">
                Task
              </div>
              <div className="relative h-7 flex-1">
                {weekMarks(range.from, range.to).map((mark) => (
                  <span
                    key={mark.iso}
                    className="absolute top-0 h-full border-l border-rule px-1 pt-1 text-label text-faint"
                    style={{ left: `${mark.percent}%` }}
                  >
                    {mark.label}
                  </span>
                ))}
              </div>
            </div>

            {/* One row per task: the label column and the bar track. */}
            <ul className="divide-y divide-rule">
              {bars.map((bar) => {
                const start = bar.start ?? bar.plannedStartDate;
                const end = bar.end ?? bar.plannedEndDate;
                if (!start || !end) {
                  return (
                    <li key={bar.id} className="flex h-(--row-height) items-center">
                      <span className="w-56 shrink-0 border-r border-rule px-3 font-mono text-meta text-faint tnum">
                        {bar.code}
                      </span>
                      <span className="px-3 text-compact text-faint">No dates</span>
                    </li>
                  );
                }

                const startOffset = Math.max(
                  0,
                  (Date.parse(`${start}T00:00:00Z`) - from) / 86_400_000,
                );
                const span = Math.max(1, (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 + 1);
                const progress = Math.min(100, Math.max(0, bar.progressPercent));

                return (
                  <li key={bar.id} className="flex h-(--row-height) items-center">
                    <div className="flex w-56 shrink-0 items-center gap-2 border-r border-rule px-3">
                      <span
                        aria-hidden="true"
                        className={cn("size-2 shrink-0 rounded-mark", bar.isCritical ? "bg-danger" : "bg-rule")}
                      />
                      <span className="truncate font-mono text-meta text-ink-muted tnum" title={bar.name}>
                        {bar.code}
                      </span>
                    </div>

                    <div className="relative h-full flex-1">
                      {/* Weekend shading, so a bar that crosses a weekend reads honestly. */}
                      <div className="absolute inset-0" aria-hidden="true">
                        {weekendMarks(range.from, range.to).map((mark) => (
                          <span
                            key={mark}
                            className="absolute top-0 h-full bg-sunk/60"
                            style={{ left: `${(mark / totalDays) * 100}%`, width: `${(1 / totalDays) * 100}%` }}
                          />
                        ))}
                      </div>

                      <div
                        role="img"
                        aria-label={`${bar.code} ${bar.name}, ${formatShortDate(start)} to ${formatShortDate(end)}${bar.isCritical ? ", critical" : `, ${bar.float ?? 0} days float`}`}
                        title={`${bar.code} ${bar.name}\n${formatShortDate(start)} → ${formatShortDate(end)}\n${bar.isCritical ? "Critical path" : `${bar.float ?? 0} days float`}`}
                        className={cn(
                          "absolute top-1/2 h-3 -translate-y-1/2 rounded-mark",
                          bar.isCritical ? "bg-danger" : "bg-accent-ink/70",
                        )}
                        style={{
                          left: `${(startOffset / totalDays) * 100}%`,
                          width: `${(span / totalDays) * 100}%`,
                        }}
                      >
                        <span
                          className="block h-full rounded-mark bg-surface/70"
                          style={{ width: `${100 - progress}%`, marginLeft: `${progress}%` }}
                          aria-hidden="true"
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>

      <p className="text-meta text-ink-muted">
        Links: {links.length} dependency {links.length === 1 ? "edge" : "edges"}. Float is the number of
        working days a task can slide before it moves the project finish.
      </p>
    </div>
  );
}

/** Monday marks across the range, as percentages of the total width. */
function weekMarks(fromIso: string, toIso: string): { iso: string; label: string; percent: number }[] {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  const totalDays = Math.max(1, Math.round((to - from) / 86_400_000) + 1);

  const marks: { iso: string; label: string; percent: number }[] = [];
  // Find the first Monday at or after the start.
  let cursor = from;
  while (new Date(cursor).getUTCDay() !== 1) cursor += 86_400_000;

  const formatter = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });

  while (cursor <= to) {
    marks.push({
      iso: new Date(cursor).toISOString().slice(0, 10),
      label: formatter.format(cursor),
      percent: (Math.round((cursor - from) / 86_400_000) / totalDays) * 100,
    });
    cursor += 7 * 86_400_000;
  }

  return marks;
}

/** Saturday indexes across the range, for weekend shading. */
function weekendMarks(fromIso: string, toIso: string): number[] {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  const totalDays = Math.round((to - from) / 86_400_000) + 1;

  const marks: number[] = [];
  for (let day = 0; day < totalDays; day++) {
    const weekday = new Date(from + day * 86_400_000).getUTCDay();
    if (weekday === 0 || weekday === 6) marks.push(day);
  }
  return marks;
}
