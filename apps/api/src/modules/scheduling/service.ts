import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "../../db/client.ts";
import {
  projects,
  scheduleRevisionItems,
  scheduleRevisions,
  taskDependencies,
  tasks,
  users,
} from "../../db/schema/index.ts";
import { calendarWithHolidays, computeSchedule, fromDayNumber, toDayNumber, workingDaysBetween, type ScheduleError } from "../../domain/scheduler.ts";
import { indonesiaHolidays, type Holiday } from "./holidays.ts";
import { errors } from "../../lib/errors.ts";
import { notify, projectAudience, recordActivity } from "../../lib/events.ts";
import { TaskService } from "../tasks/service.ts";

export interface ScheduleSummary {
  projectId: string;
  basis: "planned" | "forecast";
  projectStartDate: string | null;
  calculatedEndDate: string | null;
  projectDurationDays: number;
  criticalTaskIds: string[];
  criticalTaskCount: number;
  totalTaskCount: number;
  /** Difference in working days between the computed finish and the target. */
  varianceDays: number | null;
  lastScheduledAt: Date | null;
}

function describeScheduleError(error: ScheduleError): never {
  if (error.kind === "cycle") {
    throw errors.rule(
      "DEPENDENCY_CYCLE",
      "The plan has a dependency loop, so it cannot be scheduled. Break the loop and run the schedule again.",
    );
  }
  throw errors.rule("NO_TASKS", "This project has no tasks to schedule yet");
}

export const SchedulingService = {
  async holidayComparison(db: Database, projectId: string) {
    const { rows, links } = await TaskService.loadGraph(db, projectId);
    const [project] = await db.select({ kickoffDate: projects.kickoffDate }).from(projects).where(eq(projects.id, projectId));
    if (!project) throw errors.notFound("Project");
    const options = { basis: "planned" as const, projectStartDate: project.kickoffDate };
    const baseline = computeSchedule(rows, links, options);
    if (!baseline.ok) describeScheduleError(baseline.error);
    const loaded = new Set<number>();
    const holidays: Holiday[] = [];
    const sources: { title: string; url: string }[] = [];
    let result = baseline.result;
    for (;;) {
      const firstYear = Number(result.projectStartDate.slice(0, 4));
      const lastYear = Number(result.calculatedEndDate.slice(0, 4));
      if (lastYear - firstYear > 50) throw errors.rule("SCHEDULE_TOO_LONG", "The schedule spans more than 50 years.");
      const missing = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index).filter((year) => !loaded.has(year));
      if (missing.length === 0) break;
      const years = await Promise.all(missing.map(indonesiaHolidays));
      for (const [index, year] of missing.entries()) {
        loaded.add(year);
        holidays.push(...years[index]!.holidays);
        sources.push(...years[index]!.sources);
      }
      const calculated = computeSchedule(rows, links, { ...options, calendar: calendarWithHolidays(holidays.map((holiday) => holiday.date)) });
      if (!calculated.ok) describeScheduleError(calculated.error);
      result = calculated.result;
    }
    return { baseline: baseline.result, withHolidays: result, holidays, sources, delayCalendarDays: toDayNumber(result.calculatedEndDate) - toDayNumber(baseline.result.calculatedEndDate) };
  },
  /**
   * Runs the critical path calculation and writes the results back onto the
   * tasks. Every call is a full recompute: incremental updates over a dependency
   * graph are where scheduling tools lose their credibility.
   */
  async recalculate(
    db: Database,
    projectId: string,
    actorId: string,
    options?: { basis?: "planned" | "forecast"; silent?: boolean },
  ): Promise<ScheduleSummary> {
    const { rows, links } = await TaskService.loadGraph(db, projectId);

    const [project] = await db
      .select({
        kickoffDate: projects.kickoffDate,
        targetLaunchDate: projects.targetLaunchDate,
      })
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project) throw errors.notFound("Project");

    const basis = options?.basis ?? "forecast";

    const outcome = computeSchedule(
      rows.map((row) => ({
        id: row.id,
        durationDays: row.durationDays,
        status: row.status,
        progressPercent: row.progressPercent,
        plannedStartDate: row.plannedStartDate,
        plannedEndDate: row.plannedEndDate,
        actualStartDate: row.actualStartDate,
        actualEndDate: row.actualEndDate,
      })),
      links,
      { basis, projectStartDate: project.kickoffDate },
    );

    // An empty project is a normal state, not an error: it gets an empty summary
    // instead of a failed request.
    if (!outcome.ok && outcome.error.kind === "empty") {
      const summary: ScheduleSummary = {
        projectId,
        basis,
        projectStartDate: project.kickoffDate,
        calculatedEndDate: null,
        projectDurationDays: 0,
        criticalTaskIds: [],
        criticalTaskCount: 0,
        totalTaskCount: 0,
        varianceDays: null,
        lastScheduledAt: new Date(),
      };
      await SchedulingService.persistSummary(db, projectId, summary);
      return summary;
    }

    if (!outcome.ok) describeScheduleError(outcome.error);

    const result = outcome.result;

    /**
     * Written one statement at a time inside a transaction. The tradeoff is a
     * slower write than a bulk upsert; the gain is that a partial failure cannot
     * leave half the plan on one schedule and half on another.
     */
    await db.transaction(async (tx) => {
      for (const scheduled of result.tasks) {
        await tx
          .update(tasks)
          .set({
            earlyStart: scheduled.startDate,
            earlyFinish: scheduled.endDate,
            lateStart: scheduled.lateStartDate,
            lateFinish: scheduled.lateEndDate,
            totalFloatDays: scheduled.totalFloatDays,
            isCritical: scheduled.isCritical,
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, scheduled.id));
      }
    });

    const varianceDays = project.targetLaunchDate
      ? workingDaysBetween(
          toDayNumber(project.targetLaunchDate),
          toDayNumber(result.calculatedEndDate),
        )
      : null;

    const summary: ScheduleSummary = {
      projectId,
      basis,
      projectStartDate: result.projectStartDate,
      calculatedEndDate: result.calculatedEndDate,
      projectDurationDays: result.projectDurationDays,
      criticalTaskIds: result.criticalPathTaskIds,
      criticalTaskCount: result.criticalPathTaskIds.length,
      totalTaskCount: result.tasks.length,
      varianceDays,
      lastScheduledAt: new Date(),
    };

    await SchedulingService.persistSummary(db, projectId, summary);

    if (!options?.silent) {
      await recordActivity(db, {
        projectId,
        actorId,
        entityType: "project",
        entityId: projectId,
        action: "rescheduled",
        summary: `ran the schedule: ${result.tasks.length} tasks, finishing ${result.calculatedEndDate}`,
      });
    }

    return summary;
  },

  async persistSummary(db: Database, projectId: string, summary: ScheduleSummary) {
    await db
      .update(projects)
      .set({
        baselinedEndDate: summary.calculatedEndDate,
        lastScheduledAt: summary.lastScheduledAt,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));
  },

  async summary(db: Database, projectId: string): Promise<ScheduleSummary> {
    const [project] = await db
      .select({
        kickoffDate: projects.kickoffDate,
        targetLaunchDate: projects.targetLaunchDate,
        baselinedEndDate: projects.baselinedEndDate,
        lastScheduledAt: projects.lastScheduledAt,
      })
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project) throw errors.notFound("Project");

    const [criticalRows, [total]] = await Promise.all([
      db
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.projectId, projectId), eq(tasks.isCritical, true), isNull(tasks.deletedAt))),
      db.select({ value: count() }).from(tasks).where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt))),
    ]);

    const varianceDays =
      project.targetLaunchDate && project.baselinedEndDate
        ? workingDaysBetween(
            toDayNumber(project.targetLaunchDate),
            toDayNumber(project.baselinedEndDate),
          )
        : null;

    return {
      projectId,
      basis: "forecast",
      projectStartDate: project.kickoffDate,
      calculatedEndDate: project.baselinedEndDate,
      projectDurationDays:
        project.kickoffDate && project.baselinedEndDate
          ? workingDaysBetween(toDayNumber(project.kickoffDate), toDayNumber(project.baselinedEndDate)) + 1
          : 0,
      criticalTaskIds: criticalRows.map((row) => row.id),
      criticalTaskCount: criticalRows.length,
      totalTaskCount: total?.value ?? 0,
      varianceDays,
      lastScheduledAt: project.lastScheduledAt,
    };
  },

  /**
   * The Gantt needs a start and end for every task on one axis, which is neither
   * the planned nor the forecast date but the one the chart draws: early dates
   * when scheduling has run, planned dates otherwise.
   */
  async timeline(db: Database, projectId: string) {
    const rows = await db
      .select({
        id: tasks.id,
        code: tasks.code,
        name: tasks.name,
        status: tasks.status,
        progressPercent: tasks.progressPercent,
        plannedStartDate: tasks.plannedStartDate,
        plannedEndDate: tasks.plannedEndDate,
        earlyStart: tasks.earlyStart,
        earlyFinish: tasks.earlyFinish,
        lateStart: tasks.lateStart,
        lateFinish: tasks.lateFinish,
        totalFloatDays: tasks.totalFloatDays,
        isCritical: tasks.isCritical,
        assigneeId: tasks.assignedToId,
        assigneeName: users.name,
        milestoneId: tasks.milestoneId,
        durationDays: tasks.durationDays,
      })
      .from(tasks)
      .leftJoin(users, eq(users.id, tasks.assignedToId))
      .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt)))
      .orderBy(asc(tasks.code));

    const links = await db
      .select({
        predecessorId: taskDependencies.predecessorId,
        successorId: taskDependencies.successorId,
        type: taskDependencies.type,
        lagDays: taskDependencies.lagDays,
      })
      .from(taskDependencies)
      .where(eq(taskDependencies.projectId, projectId));

    const bars = rows.map((row) => {
      const start = row.earlyStart ?? row.plannedStartDate;
      const end = row.earlyFinish ?? row.plannedEndDate;
      return {
        ...row,
        start: start ?? row.plannedStartDate,
        end: end ?? row.plannedEndDate,
        /** Days the bar can slide before it moves the project end. */
        float: row.totalFloatDays,
      };
    });

    const dated = bars.filter((bar) => bar.start && bar.end);

    const range =
      dated.length > 0
        ? {
            from: dated.reduce((min, bar) => (bar.start! < min ? bar.start! : min), dated[0]!.start!),
            to: dated.reduce((max, bar) => (bar.end! > max ? bar.end! : max), dated[0]!.end!),
          }
        : null;

    return { bars, links, range };
  },

  async revisions(db: Database, projectId: string) {
    const rows = await db
      .select({
        id: scheduleRevisions.id,
        revisionNo: scheduleRevisions.revisionNo,
        title: scheduleRevisions.title,
        reason: scheduleRevisions.reason,
        source: scheduleRevisions.source,
        status: scheduleRevisions.status,
        baselineEndDate: scheduleRevisions.baselineEndDate,
        proposedEndDate: scheduleRevisions.proposedEndDate,
        deltaDays: scheduleRevisions.deltaDays,
        criticalPathChanged: scheduleRevisions.criticalPathChanged,
        createdAt: scheduleRevisions.createdAt,
        decidedAt: scheduleRevisions.decidedAt,
        decisionNote: scheduleRevisions.decisionNote,
        requestedById: scheduleRevisions.requestedById,
        requestedByName: users.name,
      })
      .from(scheduleRevisions)
      .innerJoin(users, eq(users.id, scheduleRevisions.requestedById))
      .where(eq(scheduleRevisions.projectId, projectId))
      .orderBy(desc(scheduleRevisions.revisionNo));

    if (rows.length === 0) return [];

    const items = await db
      .select({
        revisionId: scheduleRevisionItems.revisionId,
        taskId: scheduleRevisionItems.taskId,
        taskCode: tasks.code,
        taskName: tasks.name,
        oldStartDate: scheduleRevisionItems.oldStartDate,
        oldEndDate: scheduleRevisionItems.oldEndDate,
        newStartDate: scheduleRevisionItems.newStartDate,
        newEndDate: scheduleRevisionItems.newEndDate,
        shiftDays: scheduleRevisionItems.shiftDays,
        note: scheduleRevisionItems.note,
      })
      .from(scheduleRevisionItems)
      .innerJoin(tasks, eq(tasks.id, scheduleRevisionItems.taskId))
      .where(
        inArray(
          scheduleRevisionItems.revisionId,
          rows.map((row) => row.id),
        ),
      );

    const byRevision = new Map<string, typeof items>();
    for (const item of items) {
      const bucket = byRevision.get(item.revisionId) ?? [];
      bucket.push(item);
      byRevision.set(item.revisionId, bucket);
    }

    return rows.map((row) => ({ ...row, items: byRevision.get(row.id) ?? [] }));
  },

  /**
   * A revision is proposed, not applied. The proposal snapshots the dates it
   * would set, so approving it later applies exactly what the approver saw,
   * even if the tasks moved in between.
   */
  async proposeRevision(
    db: Database,
    projectId: string,
    input: {
      title: string;
      reason: string;
      source?: "internal" | "client" | "supplier";
      changes: { taskId: string; plannedStartDate: string; durationDays?: number; note?: string }[];
    },
    actorId: string,
  ) {
    const [project] = await db
      .select({
        code: projects.code,
        baselinedEndDate: projects.baselinedEndDate,
      })
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project) throw errors.notFound("Project");

    const taskRows = await db
      .select({
        id: tasks.id,
        code: tasks.code,
        name: tasks.name,
        plannedStartDate: tasks.plannedStartDate,
        plannedEndDate: tasks.plannedEndDate,
        earlyStart: tasks.earlyStart,
        earlyFinish: tasks.earlyFinish,
        durationDays: tasks.durationDays,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.projectId, projectId),
          inArray(
            tasks.id,
            input.changes.map((change) => change.taskId),
          ),
          isNull(tasks.deletedAt),
        ),
      );

    if (taskRows.length !== input.changes.length) {
      throw errors.invalid("Every change must name a task that belongs to this project");
    }

    const taskById = new Map(taskRows.map((row) => [row.id, row]));

    // The proposed finish is computed from the last task's new end date, so a
    // revision that only moves early tasks still reports a delta.
    let latestEnd = project.baselinedEndDate;
    const items = input.changes.map((change) => {
      const task = taskById.get(change.taskId)!;
      const duration = change.durationDays ?? task.durationDays;
      const newEnd = fromDayNumber(toDayNumber(change.plannedStartDate) + duration - 1);
      if (!latestEnd || newEnd > latestEnd) latestEnd = newEnd;

      const oldStart = task.earlyStart ?? task.plannedStartDate;
      const shift = oldStart ? toDayNumber(change.plannedStartDate) - toDayNumber(oldStart) : 0;

      return {
        taskId: change.taskId,
        oldStartDate: oldStart,
        oldEndDate: task.earlyFinish ?? task.plannedEndDate,
        newStartDate: change.plannedStartDate,
        newEndDate: newEnd,
        oldDurationDays: task.durationDays,
        newDurationDays: duration,
        shiftDays: shift,
        note: change.note ?? null,
      };
    });

    const [[existing], [projectRow]] = await Promise.all([
      db
        .select({ value: count() })
        .from(scheduleRevisions)
        .where(eq(scheduleRevisions.projectId, projectId)),
      db.select({ baselinedEndDate: projects.baselinedEndDate }).from(projects).where(eq(projects.id, projectId)),
    ]);

    const baseline = projectRow?.baselinedEndDate ?? null;
    const deltaDays = baseline && latestEnd ? toDayNumber(latestEnd) - toDayNumber(baseline) : null;

    const created = await db.transaction(async (tx) => {
      const [revision] = await tx
        .insert(scheduleRevisions)
        .values({
          projectId,
          revisionNo: (existing?.value ?? 0) + 1,
          title: input.title,
          reason: input.reason,
          source: input.source ?? "internal",
          status: "submitted",
          requestedById: actorId,
          baselineEndDate: baseline,
          proposedEndDate: latestEnd,
          deltaDays,
        })
        .returning();

      if (!revision) throw errors.rule("CREATE_FAILED", "The revision could not be created");

      await tx
        .insert(scheduleRevisionItems)
        .values(items.map((item) => ({ ...item, revisionId: revision.id })));

      return revision;
    });

    const audience = await projectAudience(db, projectId, { excludeUserId: actorId });

    await notify(db, {
      userIds: audience,
      kind: "schedule",
      title: `Schedule change proposed on ${project.code}`,
      body: `${input.title} (${deltaDays !== null && deltaDays > 0 ? `+${deltaDays}` : deltaDays ?? "?"} days)`,
      href: `/projects/${projectId}/schedule`,
      projectId,
      email: {
        subject: `Schedule change proposed: ${input.title}`,
        bodyText: `${actorId} proposed a schedule change on ${project.code}.\n\n${input.title}\n${input.reason}\n\nReview it in Zero Task.`,
        dedupeKey: `revision-proposed:${created.id}`,
      },
    });

    await recordActivity(db, {
      projectId,
      actorId,
      entityType: "revision",
      entityId: created.id,
      action: "revision_proposed",
      summary: `proposed schedule change ${input.title}`,
    });

    return SchedulingService.revisions(db, projectId);
  },

  async decideRevision(
    db: Database,
    projectId: string,
    revisionId: string,
    decision: "approved" | "rejected",
    actorId: string,
    note?: string,
  ) {
    const [revision] = await db
      .select()
      .from(scheduleRevisions)
      .where(and(eq(scheduleRevisions.id, revisionId), eq(scheduleRevisions.projectId, projectId)));

    if (!revision) throw errors.notFound("Schedule revision");

    if (revision.status !== "submitted" && revision.status !== "draft") {
      throw errors.rule(
        "ALREADY_DECIDED",
        `This revision is already ${revision.status}. A decided revision cannot be decided again.`,
      );
    }

    if (decision === "rejected") {
      await db
        .update(scheduleRevisions)
        .set({
          status: "rejected",
          decidedById: actorId,
          decidedAt: new Date(),
          decisionNote: note ?? null,
          updatedAt: new Date(),
        })
        .where(eq(scheduleRevisions.id, revisionId));

      await notify(db, {
        userIds: [revision.requestedById],
        kind: "schedule",
        title: `Schedule change rejected`,
        body: revision.title,
        href: `/projects/${projectId}/schedule`,
        projectId,
      });

      return SchedulingService.revisions(db, projectId);
    }

    const items = await db
      .select()
      .from(scheduleRevisionItems)
      .where(eq(scheduleRevisionItems.revisionId, revisionId));

    /**
     * Applied in one transaction: either every task in the proposal moves, or
     * none does. A half-applied schedule is worse than a rejected one.
     */
    await db.transaction(async (tx) => {
      for (const item of items) {
        await tx
          .update(tasks)
          .set({
            plannedStartDate: item.newStartDate,
            plannedEndDate: item.newEndDate,
            durationDays: item.newDurationDays ?? undefined,
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, item.taskId));
      }

      await tx
        .update(scheduleRevisions)
        .set({
          status: "applied",
          decidedById: actorId,
          decidedAt: new Date(),
          decisionNote: note ?? null,
          updatedAt: new Date(),
        })
        .where(eq(scheduleRevisions.id, revisionId));
    });

    // The applied dates are the new input to the schedule, so it runs again.
    await SchedulingService.recalculate(db, projectId, actorId, { silent: true });

    const audience = await projectAudience(db, projectId, { excludeUserId: actorId });

    await notify(db, {
      userIds: audience,
      kind: "schedule",
      title: `Schedule change approved`,
      body: revision.title,
      href: `/projects/${projectId}/schedule`,
      projectId,
    });

    await recordActivity(db, {
      projectId,
      actorId,
      entityType: "revision",
      entityId: revisionId,
      action: "revision_applied",
      summary: `approved schedule change ${revision.title}`,
    });

    return SchedulingService.revisions(db, projectId);
  },

  /** Every project's schedule health, for the portfolio view. */
  async portfolio(db: Database, projectIds: string[]) {
    if (projectIds.length === 0) return [];

    return db
      .select({
        projectId: projects.id,
        code: projects.code,
        name: projects.name,
        calculatedEndDate: projects.baselinedEndDate,
        targetLaunchDate: projects.targetLaunchDate,
        lastScheduledAt: projects.lastScheduledAt,
      })
      .from(projects)
      .where(inArray(projects.id, projectIds));
  },
};

