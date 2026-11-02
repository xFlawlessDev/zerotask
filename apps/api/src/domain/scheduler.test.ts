import { describe, expect, it } from "bun:test";
import {
  computeSchedule,
  calendarWithHolidays,
  fromDayNumber,
  shiftWorkingDays,
  toDayNumber,
  weekdayCalendar,
  workingDaysBetween,
  type ScheduleTask,
} from "./scheduler.ts";

/** 2026-11-02 is a Monday, which makes the expected dates easy to read. */
const MONDAY = "2026-11-02";

function task(id: string, durationDays: number, extra: Partial<ScheduleTask> = {}): ScheduleTask {
  return {
    id,
    durationDays,
    status: "not_started",
    progressPercent: 0,
    ...extra,
  };
}

function planned(tasks: ScheduleTask[], dependencies: Parameters<typeof computeSchedule>[1] = []) {
  const outcome = computeSchedule(tasks, dependencies, {
    basis: "planned",
    projectStartDate: MONDAY,
    today: MONDAY,
  });
  if (!outcome.ok) throw new Error(`unexpected failure: ${outcome.error.kind}`);
  return outcome.result;
}

describe("calendar arithmetic", () => {
  it("delays dependent tasks for holidays without counting a weekend twice", () => {
    const tasks = [task("a", 3), task("b", 1)];
    const links = [{ predecessorId: "a", successorId: "b", type: "fs" as const, lagDays: 0 }];
    const options = { basis: "planned" as const, projectStartDate: MONDAY, today: MONDAY };
    const baseline = computeSchedule(tasks, links, options);
    const withHolidays = computeSchedule(tasks, links, { ...options, calendar: calendarWithHolidays(["2026-11-03", "2026-11-07"]) });
    expect(baseline.ok && baseline.result.calculatedEndDate).toBe("2026-11-05");
    expect(withHolidays.ok && withHolidays.result.calculatedEndDate).toBe("2026-11-06");
    expect(withHolidays.ok && withHolidays.result.tasks.find((item) => item.id === "b")?.startDate).toBe("2026-11-06");
  });
  it("allows no working days on Saturday", () => {
    expect(weekdayCalendar.isWorkingDay(toDayNumber("2026-11-07"))).toBe(false);
  });

  it("treats a one-day task as starting and finishing the same day", () => {
    expect(shiftWorkingDays(toDayNumber(MONDAY), 0)).toBe(toDayNumber(MONDAY));
  });

  it("crosses a weekend when shifting three days from Friday", () => {
    const friday = toDayNumber("2026-11-06");
    // Friday plus three working days lands on Wednesday, not Monday.
    expect(fromDayNumber(shiftWorkingDays(friday, 3))).toBe("2026-11-11");
  });

  it("counts working days without counting the start day", () => {
    expect(workingDaysBetween(toDayNumber(MONDAY), toDayNumber("2026-11-06"))).toBe(4);
  });
});

describe("critical path", () => {
  it("places a chain end to end and finds no float", () => {
    const result = planned(
      [task("a", 2), task("b", 3), task("c", 1)],
      [
        { predecessorId: "a", successorId: "b", type: "fs", lagDays: 0 },
        { predecessorId: "b", successorId: "c", type: "fs", lagDays: 0 },
      ],
    );

    expect(result.tasks.find((t) => t.id === "a")?.endDate).toBe("2026-11-03");
    expect(result.tasks.find((t) => t.id === "b")?.startDate).toBe("2026-11-04");
    expect(result.tasks.find((t) => t.id === "c")?.endDate).toBe("2026-11-09");
    expect(result.criticalPathTaskIds.sort()).toEqual(["a", "b", "c"]);
    expect(result.projectDurationDays).toBe(6);
  });

  it("gives a parallel branch float and keeps it off the critical path", () => {
    const result = planned(
      [task("long", 5), task("short", 1), task("join", 1)],
      [
        { predecessorId: "long", successorId: "join", type: "fs", lagDays: 0 },
        { predecessorId: "short", successorId: "join", type: "fs", lagDays: 0 },
      ],
    );

    const short = result.tasks.find((t) => t.id === "short")!;
    expect(short.totalFloatDays).toBe(4);
    expect(short.isCritical).toBe(false);
    expect(result.criticalPathTaskIds).toContain("long");
    expect(result.criticalPathTaskIds).not.toContain("short");
  });

  it("reads FS lag as extra days off", () => {
    const result = planned(
      [task("a", 1), task("b", 1)],
      [{ predecessorId: "a", successorId: "b", type: "fs", lagDays: 2 }],
    );

    expect(result.tasks.find((t) => t.id === "b")?.startDate).toBe("2026-11-05");
  });

  it("starts a start-to-start successor on the predecessor's first day", () => {
    const result = planned(
      [task("a", 5), task("b", 2)],
      [{ predecessorId: "a", successorId: "b", type: "ss", lagDays: 0 }],
    );

    expect(result.tasks.find((t) => t.id === "b")?.startDate).toBe("2026-11-02");
  });

  it("aligns a finish-to-finish successor with the predecessor's finish", () => {
    const result = planned(
      [task("a", 4), task("b", 2)],
      [{ predecessorId: "a", successorId: "b", type: "ff", lagDays: 0 }],
    );

    const a = result.tasks.find((t) => t.id === "a")!;
    const b = result.tasks.find((t) => t.id === "b")!;
    expect(b.endDate).toBe(a.endDate);
    expect(b.startDate).toBe("2026-11-04");
  });

  it("respects a pinned start date that pushes past the dependency", () => {
    const result = planned(
      [task("a", 1), task("b", 1, { plannedStartDate: "2026-11-12" })],
      [{ predecessorId: "a", successorId: "b", type: "fs", lagDays: 0 }],
    );

    expect(result.tasks.find((t) => t.id === "b")?.startDate).toBe("2026-11-12");
  });

  it("reports a calendar delay against the planned finish", () => {
    const result = planned([
      task("late", 5, { plannedEndDate: "2026-11-03" }),
    ]);

    expect(result.tasks[0]?.endDate).toBe("2026-11-06");
    expect(result.tasks[0]?.delayDays).toBe(3);
  });
});

describe("forecast basis", () => {
  it("keeps a completed task's actual finish and starts the successor after it", () => {
    const outcome = computeSchedule(
      [
        task("done", 5, {
          status: "completed",
          progressPercent: 100,
          actualStartDate: "2026-10-26",
          actualEndDate: "2026-10-28",
        }),
        task("next", 2),
      ],
      [{ predecessorId: "done", successorId: "next", type: "fs", lagDays: 0 }],
      { basis: "forecast", projectStartDate: "2026-10-26", today: "2026-11-02" },
    );
    if (!outcome.ok) throw new Error("unexpected failure");

    const done = outcome.result.tasks.find((t) => t.id === "done")!;
    const next = outcome.result.tasks.find((t) => t.id === "next")!;
    expect(done.endDate).toBe("2026-10-28");
    expect(next.startDate).toBe("2026-10-29");
  });

  it("schedules only the remaining share of an in-progress task from today", () => {
    const outcome = computeSchedule(
      [
        task("running", 10, {
          status: "in_progress",
          progressPercent: 50,
          actualStartDate: "2026-10-26",
        }),
      ],
      [],
      { basis: "forecast", projectStartDate: "2026-10-26", today: MONDAY },
    );
    if (!outcome.ok) throw new Error("unexpected failure");

    const running = outcome.result.tasks[0]!;
    // Half of ten days is five days left, counted from today.
    expect(running.endDate).toBe("2026-11-06");
  });
});

describe("invalid graphs", () => {
  it("rejects a dependency cycle and names the tasks involved", () => {
    const outcome = computeSchedule(
      [task("a", 1), task("b", 1), task("c", 1)],
      [
        { predecessorId: "a", successorId: "b", type: "fs", lagDays: 0 },
        { predecessorId: "b", successorId: "c", type: "fs", lagDays: 0 },
        { predecessorId: "c", successorId: "a", type: "fs", lagDays: 0 },
      ],
      { basis: "planned", projectStartDate: MONDAY },
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.kind).toBe("cycle");
    if (outcome.error.kind !== "cycle") return;
    expect(outcome.error.taskIds.sort()).toEqual(["a", "b", "c"]);
  });

  it("reports an empty project rather than inventing a start date", () => {
    const outcome = computeSchedule([], [], { basis: "planned", projectStartDate: MONDAY });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.kind).toBe("empty");
  });

  it("ignores a stale edge pointing outside the project", () => {
    const result = planned([task("a", 1)], [
      { predecessorId: "ghost", successorId: "a", type: "fs", lagDays: 0 },
    ]);
    expect(result.tasks).toHaveLength(1);
  });
});
