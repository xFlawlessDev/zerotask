import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Timeline, TimelineBar } from "@/lib/api/types";
import type { TaskStatus } from "@zerotask/domain";
import { TASK_STATUSES } from "@zerotask/domain";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState, Figure } from "@/components/ui/surface";
import { TextField } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
 *
 * Two controls shape the view without touching the data: the zoom (day, week or
 * month) sets how many pixels one day occupies, and the status filter hides tasks
 * that are not relevant right now. The filter only hides rows; the schedule and the
 * finish date are always computed from the full set.
 */

type Zoom = "day" | "week" | "month";

/** Pixels per calendar day for each zoom level. */
const PX_PER_DAY: Record<Zoom, number> = { day: 42, week: 14, month: 4 };

const STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  pending_review: "Pending review",
  blocked: "Blocked",
  completed: "Completed",
  cancelled: "Cancelled",
};

const ALL = "all";
type StatusFilter = TaskStatus | typeof ALL;

export function ScheduleTab({
  projectId,
  timeline,
  error,
  onRetry,
  canRecalculate,
}: {
  projectId: string;
  timeline: Timeline | undefined;
  error: boolean;
  onRetry: () => void;
  canRecalculate: boolean;
}) {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [zoom, setZoom] = useState<Zoom>("day");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(ALL);
  const [search, setSearch] = useState("");
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [includeHolidays, setIncludeHolidays] = useState(false);
  const [comparisonRequested, setComparisonRequested] = useState(false);
  const comparison = useQuery({ queryKey: ["projects", projectId, "schedule", "holiday-comparison"], queryFn: () => api.schedule.holidayComparison(projectId), enabled: comparisonRequested, staleTime: 60_000 });

  const run = async () => {
    setRunning(true);
    try {
      await api.schedule.run(projectId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["overview"] }),
      ]);
      toast.success("Schedule recalculated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The schedule could not be recalculated");
    } finally {
      setRunning(false);
    }
  };

  const scenario = comparison.data ? (includeHolidays ? comparison.data.withHolidays : comparison.data.baseline) : undefined;
  const bars = useMemo(() => {
    if (!scenario) return timeline?.bars ?? [];
    const dates = new Map(scenario.tasks.map((task) => [task.id, task]));
    return (timeline?.bars ?? []).map((bar) => {
      const task = dates.get(bar.id);
      return task ? { ...bar, start: task.startDate, end: task.endDate, float: task.totalFloatDays, isCritical: task.isCritical } : bar;
    });
  }, [timeline, scenario]);
  const visibleBars = useMemo(
    () => bars.filter((bar) => (statusFilter === ALL || bar.status === statusFilter) && (!criticalOnly || bar.isCritical) && `${bar.code} ${bar.name}`.toLowerCase().includes(search.trim().toLowerCase())),
    [bars, statusFilter, criticalOnly, search],
  );

  if (error && !timeline) return <ErrorState description="The schedule could not be loaded." action={<Button onClick={onRetry}>Try again</Button>} />;
  if (timeline === undefined) return <LoadingState label="Loading the schedule" />;

  const { links } = timeline;
  const scheduleRange = scenario ? { from: scenario.projectStartDate, to: scenario.calculatedEndDate } : timeline.range;
  const allDates = bars.flatMap((bar) => [bar.start, bar.end, bar.plannedStartDate, bar.plannedEndDate, bar.actualStartDate, bar.actualEndDate].filter((date): date is string => !!date));
  const range = allDates.length ? { from: allDates.reduce((a, b) => a < b ? a : b), to: allDates.reduce((a, b) => a > b ? a : b) } : scheduleRange;

  if (bars.length === 0 || range === null) {
    return (
      <div className="rounded-panel border border-rule bg-surface">
        <EmptyState
          title="Nothing to schedule yet"
          description="Add tasks with durations, then run the schedule. The critical path and the finish date come from that graph."
          action={
            bars.length > 0 && canRecalculate ? (
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
  const dayPx = PX_PER_DAY[zoom];
  const trackWidth = totalDays * dayPx;
  const weekends = weekendDays(range.from, range.to);
  const holidayNames = new Map<string, string[]>();
  if (includeHolidays && comparison.data) for (const holiday of comparison.data.holidays) holidayNames.set(holiday.date, [...(holidayNames.get(holiday.date) ?? []), holiday.name]);
  const holidayOffsets = new Map<number, string>();
  for (const [date, names] of holidayNames) {
    const offset = Math.round((Date.parse(`${date}T00:00:00Z`) - from) / 86_400_000);
    if (offset >= 0 && offset < totalDays) holidayOffsets.set(offset, names.join(", "));
  }
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const todayOffset = Math.round((Date.parse(`${todayIso}T00:00:00Z`) - from) / 86_400_000);
  const selected = visibleBars.find((bar) => bar.id === selectedId);

  // The figures describe the whole project, never the filtered subset.
  const criticalCount = bars.filter((bar) => bar.isCritical).length;
  const projectFinish = scheduleRange?.to ?? range.to;

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-panel border border-rule bg-surface p-4 sm:p-5" aria-label="Holiday impact comparison">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl"><h3 className="text-section">Compare holiday impact</h3><p className="mt-1 text-compact text-ink-muted">See how Indonesian holidays and joint leave change the planned finish. Weekends are non-working in both scenarios.</p></div>
          <Button role="switch" aria-checked={includeHolidays} onClick={() => { setComparisonRequested(true); setIncludeHolidays((value) => !value); }} disabled={comparison.isFetching} variant={includeHolidays ? "primary" : "secondary"}>{includeHolidays ? "Holidays included" : "Include holidays"}</Button>
        </div>
        {comparison.isFetching && <LoadingState label="Loading Indonesian holidays and calculating scenarios" />}
        {comparison.isError && <ErrorState description={`${comparison.error instanceof Error ? comparison.error.message : "The holiday comparison could not be loaded."} The chart shows the saved schedule.`} action={<Button onClick={() => void comparison.refetch()}>Try again</Button>} />}
        {comparison.data && <><div className="mt-4 grid gap-px overflow-hidden rounded-control border border-rule bg-rule sm:grid-cols-3 text-compact"><div className={cn("bg-surface p-3", !includeHolidays && "bg-accent-wash")}><span className="block text-meta text-ink-muted">Without national holidays</span><strong className="mt-1 block text-section">{formatShortDate(comparison.data.baseline.calculatedEndDate)}</strong></div><div className={cn("bg-surface p-3", includeHolidays && "bg-accent-wash")}><span className="block text-meta text-ink-muted">With national holidays</span><strong className="mt-1 block text-section">{formatShortDate(comparison.data.withHolidays.calculatedEndDate)}</strong></div><div className="bg-surface p-3"><span className="block text-meta text-ink-muted">Finish date difference</span><strong className="mt-1 block text-section">{comparison.data.delayCalendarDays} calendar {comparison.data.delayCalendarDays === 1 ? "day" : "days"}</strong></div></div>
          <div className="mt-2 flex flex-wrap gap-x-3 text-meta">{comparison.data.sources.filter((source) => /^https:\/\//i.test(source.url)).map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="text-accent-ink underline">{source.title}</a>)}</div>
          {includeHolidays && <details className="mt-3 text-compact"><summary className="text-accent-ink">Holidays within this schedule</summary><ul className="mt-2 space-y-1 text-ink-muted">{comparison.data.holidays.filter((holiday) => holiday.date >= (comparison.data!.baseline.projectStartDate < comparison.data!.withHolidays.projectStartDate ? comparison.data!.baseline.projectStartDate : comparison.data!.withHolidays.projectStartDate) && holiday.date <= comparison.data!.withHolidays.calculatedEndDate).map((holiday) => <li key={`${holiday.date}-${holiday.name}`}>{formatShortDate(holiday.date)} · {holiday.name} {holiday.type === "joint_leave" ? "(joint leave)" : "(national holiday)"}</li>)}</ul></details>}
        </>}
        <p className="mt-3 text-meta text-ink-muted">{scenario ? `Chart: planned simulation ${includeHolidays ? "with" : "without"} national holidays.` : "Chart: saved project schedule."} Simulation does not change the saved schedule.</p>
      </section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-6">
          <Figure value={bars.filter((bar) => bar.start && bar.end).length} label="Tasks with dates" />
          <Figure
            value={criticalCount}
            label="On the critical path"
            hint="Zero float: a delay here moves the finish"
            tone={criticalCount > 0 ? "danger" : "settled"}
          />
          <Figure value={formatShortDate(projectFinish)} label="Latest finish shown" tone="accent" />
        </div>
        {canRecalculate && <Button variant="secondary" onClick={() => void run()} disabled={running}>
          <IconRecalculate />
          {running ? "Recalculating" : "Recalculate"}
        </Button>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <TextField label="Search tasks" type="search" placeholder="Name or code" value={search} onChange={(event) => setSearch(event.target.value)} />
        <div className="flex items-center gap-2">
          <span className="text-label font-medium text-faint">Status</span>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
            <SelectTrigger size="sm" className="w-40" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {TASK_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
          <Button aria-pressed={criticalOnly} variant={criticalOnly ? "primary" : "secondary"} onClick={() => setCriticalOnly((value) => !value)}>Critical only</Button>
        </div>

        <ToggleGroup
          type="single"
          value={zoom}
          onValueChange={(value) => {
            if (value) setZoom(value as Zoom);
          }}
          aria-label="Timeline scale"
        >
          <ToggleGroupItem value="day">Day</ToggleGroupItem>
          <ToggleGroupItem value="week">Week</ToggleGroupItem>
          <ToggleGroupItem value="month">Month</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <section aria-label="Project timeline" className="overflow-hidden rounded-panel border border-rule bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-3 py-3 sm:px-4">
          <div><h3 className="text-section">Project timeline</h3><p className="mt-0.5 text-meta text-ink-muted">Select a task or bar to see details. Scroll horizontally to explore dates.</p></div>
          <span className="text-meta text-ink-muted">{visibleBars.length} of {bars.length} tasks</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 border-b border-rule px-3 py-2 text-meta text-ink-muted sm:px-4" aria-label="Timeline legend">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-mark bg-accent-ink/70" /> Task</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-mark bg-danger" /> Critical task</span>
          <span className="inline-flex items-center gap-1.5"><span className="flex h-2.5 w-5 overflow-hidden rounded-mark bg-accent-ink/40"><span className="w-1/2 bg-accent-ink" /></span> Dark fill = progress</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-5 rounded-mark border border-dashed border-ink-muted" /> Planned dates</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-5 rounded-mark bg-settled" /> Actual dates</span>
          <span className="inline-flex items-center gap-1.5"><span className="text-ink-muted">→</span> Dependency</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-3 border border-rule bg-sunk" /> Weekend</span>
          {includeHolidays && comparison.data && <span className="inline-flex items-center gap-1.5"><span className="size-3 border border-caution/40 bg-caution/15" /> Holiday / joint leave</span>}
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-px bg-accent-ink" /> Today</span>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-max">
            {/* Header: one mark per Monday (week) or per month, depending on zoom. */}
            <div className="flex border-b border-rule bg-sunk">
              <div className="sticky left-0 z-10 flex w-40 shrink-0 items-center border-r border-rule bg-sunk px-3 text-label font-medium text-ink-muted sm:w-64">
                Task / date
              </div>
              <div style={{ width: trackWidth }}>
                {zoom === "day" && (
                  <div className="flex h-6 border-b border-rule" aria-label="Timeline months">
                    {monthGroups(range.from, range.to).map((month) => (
                      <div key={month.iso} className="shrink-0 overflow-hidden border-l border-rule px-1 pt-1 text-label font-medium whitespace-nowrap text-ink-muted" style={{ width: month.days * dayPx }} title={month.label}>
                        {month.label}
                      </div>
                    ))}
                  </div>
                )}
                <div className="relative h-7">
                  {timeMarks(range.from, range.to, zoom).map((mark) => (
                  <span
                    key={mark.iso}
                    className={cn("absolute top-0 flex h-full flex-col items-center justify-center border-l border-rule text-label whitespace-nowrap text-ink-muted", zoom !== "day" && "items-start px-1")}
                    style={{ left: mark.days * dayPx, ...(zoom === "day" ? { width: dayPx } : {}) }}
                  >
                    {zoom === "day" && <span className="text-[9px] leading-none text-faint">{new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(new Date(`${mark.iso}T00:00:00Z`))}</span>}{mark.label}
                  </span>
                  ))}
                </div>
              </div>
            </div>

            {visibleBars.length === 0 ? (
              <p className="px-3 py-6 text-compact text-ink-muted">No tasks match these filters.</p>
            ) : (
              <div className="relative"><ul className="divide-y divide-rule">
                {visibleBars.map((bar) => (
                  <BarRow
                    key={bar.id}
                    bar={bar}
                    from={from}
                    weekends={weekends}
                    holidayOffsets={holidayOffsets}
                    todayOffset={todayOffset >= 0 && todayOffset < totalDays ? todayOffset : null}
                    dayPx={dayPx}
                    trackWidth={trackWidth}
                    selected={selectedId === bar.id}
                    onSelect={() => setSelectedId((id) => id === bar.id ? null : bar.id)}
                  />
                ))}
              </ul><DependencyLines bars={visibleBars} links={links} from={from} dayPx={dayPx} trackWidth={trackWidth} /></div>
            )}
          </div>
        </div>
      </section>

      {selected && <section aria-label="Selected task details" className="rounded-panel border border-rule bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-mono text-meta text-ink-muted">{selected.code}</p><h3 className="mt-1 text-section text-ink">{selected.name}</h3></div><Button size="sm" onClick={() => setSelectedId(null)}>Close details</Button></div>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 text-compact">
          <div><dt className="text-ink-muted">Status</dt><dd>{STATUS_LABELS[selected.status]}</dd></div>
          <div><dt className="text-ink-muted">Assignee</dt><dd>{selected.assigneeName ?? "Unassigned"}</dd></div>
          <div><dt className="text-ink-muted">Duration</dt><dd>{selected.durationDays} working days</dd></div>
          <div><dt className="text-ink-muted">Progress</dt><dd>{selected.progressPercent}%</dd></div>
          <div><dt className="text-ink-muted">Start</dt><dd>{selected.start ? formatShortDate(selected.start) : "Not scheduled"}</dd></div>
          <div><dt className="text-ink-muted">Finish</dt><dd>{selected.end ? formatShortDate(selected.end) : "Not scheduled"}</dd></div>
          <div><dt className="text-ink-muted">Planned dates</dt><dd>{selected.plannedStartDate ? formatShortDate(selected.plannedStartDate) : "Not set"} – {selected.plannedEndDate ? formatShortDate(selected.plannedEndDate) : "Not set"}</dd></div>
          <div><dt className="text-ink-muted">Actual dates</dt><dd>{selected.actualStartDate ? formatShortDate(selected.actualStartDate) : "Not started"} – {selected.actualEndDate ? formatShortDate(selected.actualEndDate) : "Not finished"}</dd></div>
          <div><dt className="text-ink-muted">Float</dt><dd>{selected.float === null ? "Not calculated" : `${selected.float} days`}</dd></div>
          <div><dt className="text-ink-muted">Dependencies</dt><dd>{links.filter((link) => link.successorId === selected.id).length} predecessors · {links.filter((link) => link.predecessorId === selected.id).length} successors</dd></div>
        </dl>
        {links.some((link) => link.successorId === selected.id || link.predecessorId === selected.id) && <ul className="mt-4 border-t border-rule pt-3 text-compact text-ink-muted">{links.filter((link) => link.successorId === selected.id || link.predecessorId === selected.id).map((link) => { const incoming = link.successorId === selected.id; const other = bars.find((bar) => bar.id === (incoming ? link.predecessorId : link.successorId)); return <li key={link.id}>{incoming ? "Predecessor" : "Successor"}: {other ? `${other.code} ${other.name}` : "Unavailable task"} · {link.type.toUpperCase()} · lag {link.lagDays} working days</li>; })}</ul>}
      </section>}
      <p className="text-meta text-ink-muted">
        Timeline: {formatShortDate(range.from)} to {formatShortDate(range.to)} · {links.length} dependencies. Arrows connect the displayed scheduled dates; filtered tasks and their links are hidden. Outlined bars use the task's explicit planned dates; actual bars show recorded dates only. Gaps in schedule bars mark non-working days.
      </p>
    </div>
  );
}

function BarRow({
  bar,
  from,
  weekends,
  holidayOffsets,
  todayOffset,
  dayPx,
  trackWidth,
  selected,
  onSelect,
}: {
  bar: TimelineBar;
  from: number;
  weekends: number[];
  holidayOffsets: Map<number, string>;
  todayOffset: number | null;
  dayPx: number;
  trackWidth: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const start = bar.start ?? bar.plannedStartDate;
  const end = bar.end ?? bar.plannedEndDate;

  if (!start || !end) {
    return (
      <li className="flex h-16 items-center">
        <button type="button" onClick={onSelect} aria-pressed={selected} className="sticky left-0 z-10 flex h-full w-40 shrink-0 flex-col justify-center border-r border-rule bg-surface px-3 text-left hover:bg-sunk sm:w-64"><span className="font-mono text-meta text-ink-muted">{bar.code}</span><span className="w-full truncate text-compact">{bar.name}</span></button>
        <div className="relative h-full" style={{ width: trackWidth }}><span className="absolute top-1 left-2 text-meta text-faint">No schedule dates</span><DateTrack label={`Planned dates for ${bar.code}`} start={bar.plannedStartDate} end={bar.plannedEndDate} from={from} dayPx={dayPx} top={39} kind="plan" /><DateTrack label={`Actual dates for ${bar.code}`} start={bar.actualStartDate} end={bar.actualEndDate} from={from} dayPx={dayPx} top={51} kind="actual" /></div>
      </li>
    );
  }

  const startDay = (Date.parse(`${start}T00:00:00Z`) - from) / 86_400_000;
  const span = Math.max(1, (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 + 1);
  const progress = Math.min(100, Math.max(0, bar.progressPercent));
  const barWidth = Math.max(4, span * dayPx);
  const offDays = new Set([...weekends, ...holidayOffsets.keys()]);
  const segments: { start: number; days: number }[] = [];
  for (let day = 0; day < span; day++) {
    if (offDays.has(startDay + day)) continue;
    const last = segments[segments.length - 1];
    if (last && last.start + last.days === day) last.days++;
    else segments.push({ start: day, days: 1 });
  }
  const workingDays = segments.reduce((sum, segment) => sum + segment.days, 0);
  let preceding = 0;

  return (
    <li className="flex h-16 items-center">
      <button type="button" onClick={onSelect} aria-pressed={selected} className={cn("sticky left-0 z-10 flex h-full w-40 shrink-0 items-center gap-2 border-r border-rule bg-surface px-3 text-left hover:bg-sunk sm:w-64", selected && "bg-accent-wash")}>
        <span
          aria-hidden="true"
          className={cn("size-2 shrink-0 rounded-mark", bar.isCritical ? "bg-danger" : "bg-rule")}
        />
        <span className="min-w-0"><span className="block truncate text-compact font-medium text-ink">{bar.name}</span><span className="mt-0.5 block truncate text-meta text-ink-muted tnum">{bar.code} · {formatShortDate(start)} – {formatShortDate(end)}</span></span>
      </button>

      <div className="relative h-full" style={{ width: trackWidth }}>
        {/* Weekend shading, so a bar that crosses a weekend reads honestly. */}
        <div className="absolute inset-0" aria-hidden="true">
          {weekends.map((day) => (
            <span
              key={day}
              className="absolute top-0 h-full bg-sunk/60"
              style={{ left: day * dayPx, width: dayPx }}
            />
          ))}
        </div>
        {Array.from(holidayOffsets, ([day, name]) => <span key={day} title={name} className="absolute top-0 h-full bg-caution/15" style={{ left: day * dayPx, width: dayPx }} />)}
        {todayOffset !== null && <span aria-hidden="true" className="absolute top-0 z-[1] h-full w-px bg-accent-ink" style={{ left: todayOffset * dayPx }} />}

        <button type="button" onClick={onSelect} aria-label={`Show details for ${bar.code} ${bar.name}`} aria-pressed={selected}
          className="absolute top-1 h-8 rounded-control focus-visible:z-10"
          style={{ left: startDay * dayPx, width: barWidth }}>
        <span
          role="img"
          aria-label={`${bar.code} ${bar.name}, ${formatShortDate(start)} to ${formatShortDate(end)}${bar.isCritical ? ", critical" : bar.float === null ? ", float not calculated" : `, ${bar.float} days float`}`}
          title={`${bar.code} ${bar.name}\n${formatShortDate(start)} → ${formatShortDate(end)}\n${bar.isCritical ? "Critical path" : bar.float === null ? "Float not calculated" : `${bar.float} days float`}`}
          className="absolute top-1/2 left-0 h-4 w-full -translate-y-1/2"
        >
          {segments.map((segment) => {
            const filled = Math.max(0, Math.min(segment.days, workingDays * progress / 100 - preceding));
            preceding += segment.days;
            return <span key={segment.start} data-schedule-segment className={cn("absolute h-full overflow-hidden rounded-mark", bar.isCritical ? "bg-danger/40" : "bg-accent-ink/40")} style={{ left: segment.start * dayPx, width: segment.days * dayPx }} aria-hidden="true"><span className={cn("block h-full", bar.isCritical ? "bg-danger" : "bg-accent-ink")} style={{ width: `${filled / segment.days * 100}%` }} /></span>;
          })}
        </span></button>
        <DateTrack label={`Planned dates for ${bar.code}`} start={bar.plannedStartDate} end={bar.plannedEndDate} from={from} dayPx={dayPx} top={39} kind="plan" />
        <DateTrack label={`Actual dates for ${bar.code}`} start={bar.actualStartDate} end={bar.actualEndDate} from={from} dayPx={dayPx} top={51} kind="actual" />
      </div>
    </li>
  );
}

function DateTrack({ label, start, end, from, dayPx, top, kind }: { label: string; start: string | null; end: string | null; from: number; dayPx: number; top: number; kind: "plan" | "actual" }) {
  if (!start && !end) return null;
  const first = start ?? end!;
  const last = end ?? start!;
  const left = (Date.parse(`${first}T00:00:00Z`) - from) / 86_400_000 * dayPx;
  const width = start && end ? Math.max(4, ((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86_400_000 + 1) * dayPx) : Math.min(dayPx, 8);
  return <span role="img" aria-label={`${label}: ${start ? formatShortDate(start) : "start not set"} to ${end ? formatShortDate(end) : "finish not set"}`} title={`${label}: ${start ?? "start not set"} – ${end ?? "finish not set"}`} className={cn("absolute h-2 rounded-mark", kind === "plan" ? "border border-dashed border-ink-muted" : "bg-settled")} style={{ left, width, top }} />;
}

function DependencyLines({ bars, links, from, dayPx, trackWidth }: { bars: TimelineBar[]; links: Timeline["links"]; from: number; dayPx: number; trackWidth: number }) {
  const indexes = new Map(bars.map((bar, index) => [bar.id, index]));
  const coordinate = (date: string, finish: boolean) => ((Date.parse(`${date}T00:00:00Z`) - from) / 86_400_000 + (finish ? 1 : 0)) * dayPx;
  return <svg aria-hidden="true" data-testid="dependency-lines" className="pointer-events-none absolute top-0 left-40 z-[2] overflow-visible text-ink-muted sm:left-64" width={trackWidth} height={bars.length * 64}>
    <defs><marker id="schedule-dependency-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="currentColor" /></marker></defs>
    {links.map((link) => { const fromIndex = indexes.get(link.predecessorId); const toIndex = indexes.get(link.successorId); if (fromIndex === undefined || toIndex === undefined) return null; const pred = bars[fromIndex]!; const succ = bars[toIndex]!; const predFinish = link.type[0] === "f"; const succFinish = link.type[1] === "f"; const predDate = predFinish ? pred.end : pred.start; const succDate = succFinish ? succ.end : succ.start; if (!predDate || !succDate) return null; const x1 = coordinate(predDate, predFinish); const x2 = coordinate(succDate, succFinish); const y1 = fromIndex * 64 + 20; const y2 = toIndex * 64 + 20; const direction1 = predFinish ? 1 : -1; const direction2 = succFinish ? 1 : -1; const elbow1 = x1 + direction1 * 10; const elbow2 = x2 + direction2 * 10; const midY = (y1 + y2) / 2; return <path key={link.id} data-dependency-id={link.id} d={`M ${x1} ${y1} H ${elbow1} V ${midY} H ${elbow2} V ${y2} H ${x2}`} fill="none" stroke="currentColor" strokeWidth="1.25" markerEnd="url(#schedule-dependency-arrow)" />; })}
  </svg>;
}

interface TimeMark {
  iso: string;
  label: string;
  /** Offset in whole days from the start of the range. */
  days: number;
}

function monthGroups(fromIso: string, toIso: string): { iso: string; label: string; days: number }[] {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  const formatter = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const groups: { iso: string; label: string; days: number }[] = [];
  for (let cursor = from; cursor <= to; cursor += 86_400_000) {
    const date = new Date(cursor);
    const key = date.toISOString().slice(0, 7);
    const previous = groups[groups.length - 1];
    if (previous?.iso === key) previous.days += 1;
    else groups.push({ iso: key, label: formatter.format(date), days: 1 });
  }
  return groups;
}

/**
 * Header marks for the chosen zoom: every day shows the date, every week marks a
 * Monday, and every month marks the first of the month.
 */
function timeMarks(fromIso: string, toIso: string, zoom: Zoom): TimeMark[] {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  const marks: TimeMark[] = [];

  const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
  const monthFormat = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

  const offset = (time: number) => Math.round((time - from) / 86_400_000);
  const iso = (time: number) => new Date(time).toISOString().slice(0, 10);

  if (zoom === "day") {
    for (let cursor = from; cursor <= to; cursor += 86_400_000) {
      marks.push({ iso: iso(cursor), label: String(new Date(cursor).getUTCDate()), days: offset(cursor) });
    }
    return marks;
  }

  if (zoom === "week") {
    let cursor = from;
    while (new Date(cursor).getUTCDay() !== 1) cursor += 86_400_000;
    for (; cursor <= to; cursor += 7 * 86_400_000) {
      marks.push({ iso: iso(cursor), label: dayFormat.format(cursor), days: offset(cursor) });
    }
    return marks;
  }

  // Month: the first day of every month that falls inside the range.
  const start = new Date(from);
  let year = start.getUTCFullYear();
  let month = start.getUTCMonth();
  for (;;) {
    const first = Date.UTC(year, month, 1);
    if (first > to) break;
    if (first >= from) {
      marks.push({ iso: iso(first), label: monthFormat.format(first), days: offset(first) });
    }
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return marks;
}

/** Day offsets across the range that fall on a Saturday or Sunday. */
function weekendDays(fromIso: string, toIso: string): number[] {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  const totalDays = Math.round((to - from) / 86_400_000) + 1;

  const days: number[] = [];
  for (let day = 0; day < totalDays; day++) {
    const weekday = new Date(from + day * 86_400_000).getUTCDay();
    if (weekday === 0 || weekday === 6) days.push(day);
  }
  return days;
}
