import { describe, expect, it } from "bun:test";
import { countLabel, countWeekdays, plural, workloadWindow } from "@zerotask/domain";

/**
 * Text and date arithmetic that the UI depends on. These are pure functions, so
 * they are tested directly: the pages that call them are covered by the browser
 * check, but a wrong plural or an off-by-one window is cheapest to catch here.
 */

describe("plural / countLabel", () => {
  it("agrees the noun with the count", () => {
    expect(countLabel(1, "active project")).toBe("1 active project");
    expect(countLabel(0, "active project")).toBe("0 active projects");
    expect(countLabel(2, "active project")).toBe("2 active projects");
    expect(countLabel(1, "task")).toBe("1 task");
  });

  it("takes an irregular plural", () => {
    expect(plural(1, "person", "people")).toBe("person");
    expect(plural(3, "person", "people")).toBe("people");
    expect(countLabel(1, "person", "people")).toBe("1 person");
    expect(countLabel(3, "person", "people")).toBe("3 people");
  });
});

describe("workloadWindow", () => {
  it("ends today and spans the requested number of days", () => {
    expect(workloadWindow(14, "2026-11-07")).toEqual({ from: "2026-10-25", to: "2026-11-07" });
    expect(workloadWindow(28, "2026-11-07")).toEqual({ from: "2026-10-11", to: "2026-11-07" });
    expect(workloadWindow(7, "2026-11-07")).toEqual({ from: "2026-11-01", to: "2026-11-07" });
    expect(workloadWindow(1, "2026-11-07")).toEqual({ from: "2026-11-07", to: "2026-11-07" });
  });

  it("includes the logged past rather than only the future", () => {
    const today = "2026-11-07";
    const { from, to } = workloadWindow(14, today);
    // A log written three days ago must be inside the window the page reports.
    expect("2026-11-04" >= from).toBe(true);
    expect("2026-11-04" <= to).toBe(true);
  });

  it("crosses a month and a leap day without drifting", () => {
    expect(workloadWindow(2, "2028-03-01")).toEqual({ from: "2028-02-29", to: "2028-03-01" });
    expect(workloadWindow(31, "2026-01-15")).toEqual({ from: "2025-12-16", to: "2026-01-15" });
  });
});

describe("countWeekdays", () => {
  it("counts Monday to Friday and skips the weekend", () => {
    // 2 Nov 2026 is a Monday; the 8th is a Sunday.
    expect(countWeekdays("2026-11-02", "2026-11-08")).toBe(5);
    expect(countWeekdays("2026-11-02", "2026-11-02")).toBe(1);
  });

  it("returns zero for a window with no weekdays or an inverted range", () => {
    expect(countWeekdays("2026-11-07", "2026-11-07")).toBe(0);
    expect(countWeekdays("2026-11-08", "2026-11-02")).toBe(0);
  });
});

/**
 * The labels the UI actually renders. `Figure` agrees `label` with a numeric value
 * only when `plural` is supplied, so these assert the pairs the pages pass.
 */
describe("figure label agreement", () => {
  it("takes the singular for exactly one", () => {
    expect(plural(1, "open task")).toBe("open task");
    expect(plural(1, "person", "people")).toBe("person");
    expect(plural(1, "task scheduled", "tasks scheduled")).toBe("task scheduled");
    expect(plural(1, "project past its target", "projects past their target")).toBe(
      "project past its target",
    );
  });

  it("takes the plural for zero and for more than one", () => {
    expect(plural(0, "task", "tasks")).toBe("tasks");
    expect(plural(2, "open task")).toBe("open tasks");
    expect(plural(2, "person", "people")).toBe("people");
    expect(plural(3, "working day in window", "working days in window")).toBe(
      "working days in window",
    );
  });
});
