import type { DependencyType } from "@zerotask/domain";

/**
 * Critical-path scheduling over a working-day calendar.
 *
 * Every date inside this module is an absolute day number (days since the Unix
 * epoch, UTC). Working in day numbers rather than Date objects keeps the graph
 * arithmetic free of timezone drift, and working days rather than calendar days
 * is what makes a Friday start plus a three-day task end on Tuesday.
 *
 * A day is a working day when it is Monday to Friday. Holidays are not modelled;
 * a team that needs them replaces `weekdayCalendar`, and every function below is
 * already expressed in terms of it.
 */

export interface Calendar {
  isWorkingDay: (dayNumber: number) => boolean;
}

export const weekdayCalendar: Calendar = {
  isWorkingDay: (dayNumber) => {
    const weekday = new Date(dayNumber * 86_400_000).getUTCDay();
    return weekday !== 0 && weekday !== 6;
  },
};

const MS_PER_DAY = 86_400_000;

export interface ScheduleTask {
  id: string;
  durationDays: number;
  /** A pinned date is a constraint: the task still respects its predecessors. */
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  actualStartDate?: string | null;
  actualEndDate?: string | null;
  status: string;
  progressPercent: number;
}

export interface ScheduleDependency {
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  lagDays: number;
}

export interface ScheduledTask {
  id: string;
  startDate: string;
  endDate: string;
  lateStartDate: string;
  lateEndDate: string;
  totalFloatDays: number;
  isCritical: boolean;
  /** Working days the computed finish sits past the planned finish. */
  delayDays: number;
}

export interface ScheduleResult {
  projectStartDate: string;
  calculatedEndDate: string;
  projectDurationDays: number;
  criticalPathTaskIds: string[];
  tasks: ScheduledTask[];
}

export type ScheduleError =
  | { kind: "cycle"; taskIds: string[] }
  | { kind: "empty" };

export type ScheduleOutcome =
  | { ok: true; result: ScheduleResult }
  | { ok: false; error: ScheduleError };

export interface ScheduleOptions {
  /** `forecast` folds actual dates and progress in; `planned` ignores them. */
  basis: "planned" | "forecast";
  projectStartDate?: string | null;
  /** Defaults to the current UTC date. Injected so tests are deterministic. */
  today?: string;
  calendar?: Calendar;
}

// --- day numbers ------------------------------------------------------------

export function toDayNumber(isoDate: string): number {
  const parsed = Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(parsed)) throw new Error(`Invalid date: ${isoDate}`);
  return Math.round(parsed / MS_PER_DAY);
}

export function fromDayNumber(dayNumber: number): string {
  return new Date(dayNumber * MS_PER_DAY).toISOString().slice(0, 10);
}

function isWorking(day: number, calendar: Calendar): boolean {
  return calendar.isWorkingDay(day);
}

/** Snaps a weekend or holiday forward to the next working day. */
export function nextWorkingDay(day: number, calendar: Calendar = weekdayCalendar): number {
  let current = day;
  while (!isWorking(current, calendar)) current++;
  return current;
}

/**
 * Moves by a signed number of working days. `count` of 0 returns the day itself
 * if it is a working day, so callers can express "start plus n-1 days".
 */
export function shiftWorkingDays(
  day: number,
  count: number,
  calendar: Calendar = weekdayCalendar,
): number {
  if (count === 0) return nextWorkingDay(day, calendar);
  let current = day;
  let remaining = Math.abs(count);
  const step = count > 0 ? 1 : -1;
  while (remaining > 0) {
    current += step;
    if (isWorking(current, calendar)) remaining--;
  }
  return current;
}

/** Working days strictly after `from` up to and including `to`. */
export function workingDaysBetween(
  from: number,
  to: number,
  calendar: Calendar = weekdayCalendar,
): number {
  if (to <= from) return 0;
  let count = 0;
  for (let day = from + 1; day <= to; day++) {
    if (isWorking(day, calendar)) count++;
  }
  return count;
}

// --- graph ------------------------------------------------------------------

function topologicalOrder(
  taskIds: string[],
  dependencies: ScheduleDependency[],
): { order: string[]; cycle: string[] | null } {
  const known = new Set(taskIds);
  const successors = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const id of taskIds) {
    successors.set(id, []);
    inDegree.set(id, 0);
  }

  for (const dependency of dependencies) {
    // An edge to a task outside this project is ignored rather than fatal: a
    // delete can leave a stray row briefly visible to a concurrent read.
    if (!known.has(dependency.predecessorId) || !known.has(dependency.successorId)) continue;
    successors.get(dependency.predecessorId)!.push(dependency.successorId);
    inDegree.set(dependency.successorId, (inDegree.get(dependency.successorId) ?? 0) + 1);
  }

  const queue = taskIds.filter((id) => inDegree.get(id) === 0);
  const order: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);
    for (const successor of successors.get(current) ?? []) {
      const remaining = (inDegree.get(successor) ?? 1) - 1;
      inDegree.set(successor, remaining);
      if (remaining === 0) queue.push(successor);
    }
  }

  if (order.length !== taskIds.length) {
    const settled = new Set(order);
    return { order, cycle: taskIds.filter((id) => !settled.has(id)) };
  }

  return { order, cycle: null };
}

/**
 * Earliest start a dependency permits, in absolute day numbers.
 *
 * SS and FF exist because real handovers are rarely finish-to-start: testing can
 * begin while development is still running, and two documents can be signed off
 * together. The successor's duration appears in FF and SF because those
 * constraints anchor the successor's finish, not its start.
 */
function dependencyStart(
  type: DependencyType,
  predecessorStart: number,
  predecessorFinish: number,
  successorDuration: number,
  lagDays: number,
  calendar: Calendar,
): number {
  switch (type) {
    case "ss":
      return shiftWorkingDays(predecessorStart, lagDays, calendar);
    case "ff":
      return shiftWorkingDays(predecessorFinish, lagDays - (successorDuration - 1), calendar);
    case "sf":
      return shiftWorkingDays(predecessorStart, lagDays - (successorDuration - 1), calendar);
    case "fs":
    default:
      return shiftWorkingDays(predecessorFinish, 1 + lagDays, calendar);
  }
}

/** Latest finish a successor permits, in absolute day numbers. */
function dependencyFinish(
  type: DependencyType,
  successorLateStart: number,
  successorLateFinish: number,
  duration: number,
  lagDays: number,
  calendar: Calendar,
): number {
  switch (type) {
    case "ss":
      return shiftWorkingDays(successorLateStart, duration - 1 - lagDays, calendar);
    case "ff":
      return shiftWorkingDays(successorLateFinish, -lagDays, calendar);
    case "sf":
      return shiftWorkingDays(successorLateFinish, -lagDays - (duration - 1), calendar);
    case "fs":
    default:
      return shiftWorkingDays(successorLateStart, -1 - lagDays, calendar);
  }
}

export function computeSchedule(
  tasks: ScheduleTask[],
  dependencies: ScheduleDependency[],
  options: ScheduleOptions,
): ScheduleOutcome {
  if (tasks.length === 0) return { ok: false, error: { kind: "empty" } };

  const calendar = options.calendar ?? weekdayCalendar;
  const { order, cycle } = topologicalOrder(
    tasks.map((task) => task.id),
    dependencies,
  );
  if (cycle) return { ok: false, error: { kind: "cycle", taskIds: cycle } };

  const today = toDayNumber(options.today ?? new Date().toISOString().slice(0, 10));

  const pinnedStarts = tasks.flatMap((task) => {
    const pinned = task.actualStartDate ?? task.plannedStartDate;
    return pinned ? [toDayNumber(pinned)] : [];
  });

  const projectStart = nextWorkingDay(
    options.projectStartDate
      ? toDayNumber(options.projectStartDate)
      : pinnedStarts.length > 0
        ? Math.min(...pinnedStarts)
        : today,
    calendar,
  );

  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const predecessorsOf = new Map<string, ScheduleDependency[]>();
  const successorsOf = new Map<string, ScheduleDependency[]>();

  for (const dependency of dependencies) {
    if (!taskById.has(dependency.predecessorId) || !taskById.has(dependency.successorId)) continue;
    const intoSuccessor = predecessorsOf.get(dependency.successorId) ?? [];
    intoSuccessor.push(dependency);
    predecessorsOf.set(dependency.successorId, intoSuccessor);

    const fromPredecessor = successorsOf.get(dependency.predecessorId) ?? [];
    fromPredecessor.push(dependency);
    successorsOf.set(dependency.predecessorId, fromPredecessor);
  }

  const startOf = new Map<string, number>();
  const finishOf = new Map<string, number>();
  const spanOf = new Map<string, number>();

  for (const taskId of order) {
    const task = taskById.get(taskId);
    if (!task) continue;
    const duration = Math.max(1, task.durationDays);

    let earliest = projectStart;
    for (const dependency of predecessorsOf.get(taskId) ?? []) {
      const predecessorStart = startOf.get(dependency.predecessorId);
      const predecessorFinish = finishOf.get(dependency.predecessorId);
      if (predecessorStart === undefined || predecessorFinish === undefined) continue;
      earliest = Math.max(
        earliest,
        dependencyStart(
          dependency.type,
          predecessorStart,
          predecessorFinish,
          duration,
          dependency.lagDays,
          calendar,
        ),
      );
    }

    if (task.plannedStartDate) {
      earliest = Math.max(earliest, toDayNumber(task.plannedStartDate));
    }

    let start = nextWorkingDay(earliest, calendar);
    let finish: number;

    const forecastDone =
      options.basis === "forecast" && task.status === "completed" && task.actualEndDate;
    const forecastRunning =
      options.basis === "forecast" && !forecastDone && (task.status === "in_progress" || !!task.actualStartDate);

    if (forecastDone) {
      finish = nextWorkingDay(toDayNumber(task.actualEndDate!), calendar);
      start = task.actualStartDate
        ? Math.min(nextWorkingDay(toDayNumber(task.actualStartDate), calendar), finish)
        : finish;
    } else if (forecastRunning) {
      start = task.actualStartDate
        ? Math.min(nextWorkingDay(toDayNumber(task.actualStartDate), calendar), start)
        : start;
      const remaining = Math.max(1, Math.ceil((duration * (100 - task.progressPercent)) / 100));
      // Work still owed cannot start before today, however early the task began.
      finish = shiftWorkingDays(Math.max(start, today), remaining - 1, calendar);
      finish = Math.max(finish, start);
    } else {
      finish = shiftWorkingDays(start, duration - 1, calendar);
    }

    startOf.set(taskId, start);
    finishOf.set(taskId, finish);
    spanOf.set(taskId, Math.max(1, workingDaysBetween(start - 1, finish, calendar)));
  }

  const projectEnd = Math.max(...[...finishOf.values()].filter((value) => Number.isFinite(value)));

  const lateStartOf = new Map<string, number>();
  const lateFinishOf = new Map<string, number>();

  for (let index = order.length - 1; index >= 0; index--) {
    const taskId = order[index];
    if (!taskId) continue;
    const duration = spanOf.get(taskId) ?? 1;
    let latest = projectEnd;

    for (const dependency of successorsOf.get(taskId) ?? []) {
      const successorLateStart = lateStartOf.get(dependency.successorId);
      const successorLateFinish = lateFinishOf.get(dependency.successorId);
      if (successorLateStart === undefined || successorLateFinish === undefined) continue;
      latest = Math.min(
        latest,
        dependencyFinish(
          dependency.type,
          successorLateStart,
          successorLateFinish,
          duration,
          dependency.lagDays,
          calendar,
        ),
      );
    }

    lateFinishOf.set(taskId, latest);
    lateStartOf.set(taskId, shiftWorkingDays(latest, -(duration - 1), calendar));
  }

  const scheduled: ScheduledTask[] = order.map((taskId) => {
    const task = taskById.get(taskId)!;
    const start = startOf.get(taskId)!;
    const finish = finishOf.get(taskId)!;
    const lateStart = lateStartOf.get(taskId) ?? start;
    // Float is how far the start may slide, so it is the count of working days
    // strictly after the early start up to the late start.
    const float = Math.max(0, workingDaysBetween(start, lateStart, calendar));

    return {
      id: taskId,
      startDate: fromDayNumber(start),
      endDate: fromDayNumber(finish),
      lateStartDate: fromDayNumber(lateStart),
      lateEndDate: fromDayNumber(lateFinishOf.get(taskId) ?? finish),
      totalFloatDays: float,
      isCritical: float === 0,
      delayDays: task.plannedEndDate
        ? Math.max(0, workingDaysBetween(toDayNumber(task.plannedEndDate), finish, calendar))
        : 0,
    };
  });

  return {
    ok: true,
    result: {
      projectStartDate: fromDayNumber(projectStart),
      calculatedEndDate: fromDayNumber(projectEnd),
      projectDurationDays: Math.max(0, workingDaysBetween(projectStart - 1, projectEnd, calendar)),
      criticalPathTaskIds: scheduled.filter((task) => task.isCritical).map((task) => task.id),
      tasks: scheduled,
    },
  };
}
