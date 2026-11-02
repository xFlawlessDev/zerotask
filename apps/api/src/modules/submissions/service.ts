import { and, asc, count, desc, eq, gte, inArray, isNull, or } from "drizzle-orm";
import type { Database } from "../../db/client.ts";
import {
  documents,
  projectMembers,
  submissionDecisions,
  submissionDocuments,
  submissionReviewers,
  submissions,
  taskApprovalConfig,
  taskApprovers,
  tasks,
  users,
} from "../../db/schema/index.ts";
import { errors } from "../../lib/errors.ts";
import { notify, projectAudience, recordActivity } from "../../lib/events.ts";
import { SchedulingService } from "../scheduling/service.ts";

export interface ReviewerDecision {
  required: number;
  mode: "any" | "all";
  approved: number;
  rejected: number;
  decided: boolean;
  outcome: "approved" | "rejected" | null;
}

/**
 * The approver rule, as a pure function.
 *
 * `any` means reach the required count of approvals and the submission passes.
 * `all` means every assigned reviewer must approve; one rejection fails it. Both
 * modes fail immediately on any rejection, because letting a submission sit
 * while one reviewer objects wastes the submitter's time.
 */
export function evaluateDecisions(input: {
  decisions: { decision: "approved" | "rejected" }[];
  requiredApprovals: number;
  approvalMode: "any" | "all";
  reviewerCount: number;
}): ReviewerDecision {
  const approved = input.decisions.filter((d) => d.decision === "approved").length;
  const rejected = input.decisions.filter((d) => d.decision === "rejected").length;

  const base = {
    required: input.requiredApprovals,
    mode: input.approvalMode,
    approved,
    rejected,
  };

  if (rejected > 0) return { ...base, decided: true, outcome: "rejected" };

  const needed =
    input.approvalMode === "all" ? Math.max(input.requiredApprovals, input.reviewerCount) : input.requiredApprovals;

  if (approved >= needed) return { ...base, decided: true, outcome: "approved" };
  return { ...base, decided: false, outcome: null };
}

export const SubmissionService = {
  async list(db: Database, projectId: string, options: { status?: string; limit?: number }) {
    const filters = [eq(submissions.projectId, projectId)];
    if (options.status) filters.push(eq(submissions.status, options.status as never));

    const rows = await db
      .select({
        id: submissions.id,
        taskId: submissions.taskId,
        taskCode: tasks.code,
        taskName: tasks.name,
        kind: submissions.kind,
        status: submissions.status,
        note: submissions.note,
        progressPercent: submissions.progressPercent,
        hoursSpent: submissions.hoursSpent,
        requiredApprovals: submissions.requiredApprovals,
        approvalMode: submissions.approvalMode,
        createdAt: submissions.createdAt,
        decidedAt: submissions.decidedAt,
        submittedById: submissions.submittedById,
        submitterName: users.name,
        submitterImage: users.image,
      })
      .from(submissions)
      .innerJoin(tasks, eq(tasks.id, submissions.taskId))
      .innerJoin(users, eq(users.id, submissions.submittedById))
      .where(and(...filters))
      .orderBy(desc(submissions.createdAt))
      .limit(options.limit ?? 50);

    if (rows.length === 0) return [];

    const [decisions, reviewerRows, documentRows] = await Promise.all([
      db
        .select({
          submissionId: submissionDecisions.submissionId,
          reviewerId: submissionDecisions.reviewerId,
          reviewerName: users.name,
          decision: submissionDecisions.decision,
          note: submissionDecisions.note,
          createdAt: submissionDecisions.createdAt,
        })
        .from(submissionDecisions)
        .innerJoin(users, eq(users.id, submissionDecisions.reviewerId))
        .where(
          inArray(
            submissionDecisions.submissionId,
            rows.map((row) => row.id),
          ),
        ),
      db
        .select({
          submissionId: submissionReviewers.submissionId,
          userId: submissionReviewers.userId,
          name: users.name,
          image: users.image,
        })
        .from(submissionReviewers)
        .innerJoin(users, eq(users.id, submissionReviewers.userId))
        .where(
          inArray(
            submissionReviewers.submissionId,
            rows.map((row) => row.id),
          ),
        ),
      db
        .select({
          submissionId: submissionDocuments.submissionId,
          id: documents.id,
          code: documents.code,
          name: documents.name,
          kind: documents.kind,
          storageKey: documents.storageKey,
          mimeType: documents.mimeType,
          sizeBytes: documents.sizeBytes,
        })
        .from(submissionDocuments)
        .innerJoin(documents, eq(documents.id, submissionDocuments.documentId))
        .where(
          inArray(
            submissionDocuments.submissionId,
            rows.map((row) => row.id),
          ),
        ),
    ]);

    const bySubmission = <T extends { submissionId: string }>(list: T[]) => {
      const map = new Map<string, T[]>();
      for (const entry of list) {
        const bucket = map.get(entry.submissionId) ?? [];
        bucket.push(entry);
        map.set(entry.submissionId, bucket);
      }
      return map;
    };

    const decisionMap = bySubmission(decisions);
    const reviewerMap = bySubmission(reviewerRows);
    const documentMap = bySubmission(documentRows);

    return rows.map((row) => {
      const rowDecisions = decisionMap.get(row.id) ?? [];
      const rowReviewers = reviewerMap.get(row.id) ?? [];
      return {
        ...row,
        reviewers: rowReviewers.map((reviewer) => {
          const decision = rowDecisions.find((entry) => entry.reviewerId === reviewer.userId);
          return {
            ...reviewer,
            decision: decision?.decision ?? null,
            decisionNote: decision?.note ?? null,
            decidedAt: decision?.createdAt ?? null,
          };
        }),
        decisions: rowDecisions,
        documents: documentMap.get(row.id) ?? [],
        tally: evaluateDecisions({
          decisions: rowDecisions,
          requiredApprovals: row.requiredApprovals,
          approvalMode: row.approvalMode,
          reviewerCount: rowReviewers.length,
        }),
      };
    });
  },

  /**
   * Only one submission may be in flight per task. Two open reviews for the same
   * work means two reviewers can approve different things and both be right.
   */
  async create(
    db: Database,
    projectId: string,
    taskId: string,
    submitterId: string,
    input: {
      kind?: "progress" | "completion" | "handover";
      note?: string | null;
      progressPercent?: number;
      hoursSpent?: number | null;
      documentIds?: string[];
    },
  ) {
    const [task] = await db
      .select({
        id: tasks.id,
        code: tasks.code,
        name: tasks.name,
        status: tasks.status,
        assigneeId: tasks.assignedToId,
        reviewerId: tasks.reviewerId,
        projectId: tasks.projectId,
      })
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.projectId, projectId), isNull(tasks.deletedAt)));

    if (!task) throw errors.notFound("Task");

    if (task.status === "completed") {
      throw errors.rule("ALREADY_COMPLETED", "This task is already completed");
    }
    if (task.status === "pending_review") {
      throw errors.rule("AWAITING_REVIEW", "This task already has a submission waiting for review");
    }
    if (task.status === "cancelled") {
      throw errors.rule("CANCELLED_TASK", "A cancelled task cannot be submitted for review");
    }

    const kind = input.kind ?? "completion";

    // The approver list is frozen onto the submission now, so a config edit during
    // review cannot change who is allowed to decide what is already submitted.
    const [config, configuredApprovers] = await Promise.all([
      db.query.taskApprovalConfig.findFirst({ where: eq(taskApprovalConfig.taskId, taskId) }),
      db
        .select({ userId: taskApprovers.userId, sortOrder: taskApprovers.sortOrder })
        .from(taskApprovers)
        .where(eq(taskApprovers.taskId, taskId))
        .orderBy(asc(taskApprovers.sortOrder)),
    ]);

    let reviewers = configuredApprovers.map((approver) => approver.userId);

    if (reviewers.length === 0 && task.reviewerId) reviewers = [task.reviewerId];

    if (reviewers.length === 0) {
      // Fall back to the project's managers so a submission is never orphaned.
      const managers = await db
        .select({ userId: projectMembers.userId })
        .from(projectMembers)
        .where(
          and(
            eq(projectMembers.projectId, projectId),
            or(eq(projectMembers.role, "manager"), eq(projectMembers.role, "owner")),
          ),
        );

      reviewers = managers.map((manager) => manager.userId).filter((id) => id !== submitterId);
    }

    if (reviewers.length === 0) {
      throw errors.rule(
        "NO_REVIEWER",
        "This task has no reviewer and the project has no manager to review it. Set a reviewer first.",
      );
    }

    const requiredApprovals = config?.requiredApprovals ?? 1;
    const approvalMode = config?.approvalMode ?? "any";

    const created = await db.transaction(async (tx) => {
      const [submission] = await tx
        .insert(submissions)
        .values({
          taskId,
          projectId,
          submittedById: submitterId,
          kind,
          status: "pending_review",
          note: input.note ?? null,
          progressPercent: input.progressPercent ?? null,
          hoursSpent: input.hoursSpent != null ? String(input.hoursSpent) : null,
          requiredApprovals,
          approvalMode,
        })
        .returning();

      if (!submission) throw errors.rule("CREATE_FAILED", "The submission could not be created");

      await tx
        .insert(submissionReviewers)
        .values(reviewers.map((userId, index) => ({ submissionId: submission.id, userId, sortOrder: index })));

      if (input.documentIds && input.documentIds.length > 0) {
        const owned = await tx
          .select({ id: documents.id })
          .from(documents)
          .where(
            and(
              inArray(documents.id, input.documentIds),
              eq(documents.projectId, projectId),
              isNull(documents.deletedAt),
            ),
          );

        if (owned.length !== input.documentIds.length) {
          throw errors.invalid("Every attached document must belong to this project");
        }

        await tx
          .insert(submissionDocuments)
          .values(input.documentIds.map((documentId) => ({ submissionId: submission.id, documentId })))
          .onConflictDoNothing();
      }

      // The task enters review in the same transaction as the submission, so the
      // two can never disagree about what state the work is in.
      await tx
        .update(tasks)
        .set({
          status: "pending_review",
          progressPercent: input.progressPercent ?? undefined,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, taskId));

      return submission;
    });

    await notify(db, {
      userIds: reviewers,
      kind: "review",
      title: `${task.code} is ready for review`,
      body: input.note ?? task.name,
      href: `/projects/${projectId}/tasks/${taskId}`,
      projectId,
      email: {
        subject: `Review needed: ${task.code} ${task.name}`,
        bodyText: `${task.code} ${task.name} was submitted for review.\n\n${input.note ?? ""}\n\nReview it in Zero Task.`,
        dedupeKey: `submission-created:${created.id}`,
      },
    });

    await recordActivity(db, {
      projectId,
      actorId: submitterId,
      entityType: "submission",
      entityId: created.id,
      action: "submission_created",
      summary: `submitted ${task.code} for review`,
    });

    const list = await SubmissionService.list(db, projectId, { limit: 1 });
    return list[0]!;
  },

  /**
   * A decision is final per reviewer: one reviewer, one verdict. Changing your
   * mind is a new submission, not an edit of the record someone else relied on.
   */
  async decide(
    db: Database,
    projectId: string,
    submissionId: string,
    reviewerId: string,
    reviewerRole: string,
    decision: "approved" | "rejected",
    note?: string,
  ) {
    const [submission] = await db
      .select()
      .from(submissions)
      .where(and(eq(submissions.id, submissionId), eq(submissions.projectId, projectId)));

    if (!submission) throw errors.notFound("Submission");

    if (submission.status !== "pending_review") {
      throw errors.rule(
        "ALREADY_DECIDED",
        `This submission is already ${submission.status.replaceAll("_", " ")}`,
      );
    }

    const eligible = await db
      .select({ userId: submissionReviewers.userId })
      .from(submissionReviewers)
      .where(eq(submissionReviewers.submissionId, submissionId));

    const isAssigned = eligible.some((row) => row.userId === reviewerId);

    // Admins may break a deadlock; assigned reviewers may always act. Nobody else.
    if (!isAssigned && reviewerRole !== "admin") {
      throw errors.forbidden("You are not a reviewer on this submission");
    }

    if (submission.submittedById === reviewerId) {
      throw errors.rule("SELF_REVIEW", "You cannot review your own submission");
    }

    const [existing] = await db
      .select({ id: submissionDecisions.id })
      .from(submissionDecisions)
      .where(
        and(
          eq(submissionDecisions.submissionId, submissionId),
          eq(submissionDecisions.reviewerId, reviewerId),
        ),
      );

    if (existing) {
      throw errors.rule("ALREADY_VOTED", "You have already decided this submission");
    }

    await db.insert(submissionDecisions).values({
      submissionId,
      reviewerId,
      decision,
      note: note ?? null,
    });

    const decisions = await db
      .select({ decision: submissionDecisions.decision })
      .from(submissionDecisions)
      .where(eq(submissionDecisions.submissionId, submissionId));

    const tally = evaluateDecisions({
      decisions,
      requiredApprovals: submission.requiredApprovals,
      approvalMode: submission.approvalMode,
      reviewerCount: eligible.length,
    });

    if (tally.decided && tally.outcome) {
      await SubmissionService.settle(db, projectId, submission, tally.outcome, reviewerId);
    } else {
      // Still waiting on someone. Update the task's progress if the submission
      // reported more than the task currently shows.
      if (submission.progressPercent !== null) {
        await db
          .update(tasks)
          .set({
            progressPercent: Math.max(submission.progressPercent, 0),
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, submission.taskId));
      }
    }

    const list = await SubmissionService.list(db, projectId, { limit: 200 });
    return list.find((row) => row.id === submissionId)!;
  },

  /**
   * The terminal transition. Approving completes the task; rejecting returns it
   * to work so the assignee can act on the note.
   */
  async settle(
    db: Database,
    projectId: string,
    submission: typeof submissions.$inferSelect,
    outcome: "approved" | "rejected",
    actorId: string,
  ) {
    const today = new Date().toISOString().slice(0, 10);

    await db.transaction(async (tx) => {
      await tx
        .update(submissions)
        .set({
          status: outcome === "approved" ? "approved" : "rejected",
          decidedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(submissions.id, submission.id));

      if (outcome === "approved") {
        await tx
          .update(tasks)
          .set({
            status: "completed",
            progressPercent: 100,
            actualEndDate: today,
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, submission.taskId));
      } else {
        await tx
          .update(tasks)
          .set({
            status: "in_progress",
            progressPercent: 0,
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, submission.taskId));
      }
    });

    // Completing a task frees its successors, which changes the critical path.
    if (outcome === "approved") {
      await SchedulingService.recalculate(db, projectId, actorId, { silent: true });
    }

    const [task] = await db
      .select({ code: tasks.code, name: tasks.name, assigneeId: tasks.assignedToId })
      .from(tasks)
      .where(eq(tasks.id, submission.taskId));

    await notify(db, {
      userIds: [submission.submittedById],
      kind: "review",
      title:
        outcome === "approved"
          ? `${task?.code} was approved`
          : `${task?.code} needs more work`,
      body: task?.name,
      href: `/projects/${projectId}/tasks/${submission.taskId}`,
      projectId,
      email: {
        subject:
          outcome === "approved"
            ? `Approved: ${task?.code} ${task?.name}`
            : `Changes requested: ${task?.code} ${task?.name}`,
        bodyText: `Your submission was ${outcome}.\n\n${task?.code} ${task?.name}`,
        dedupeKey: `submission-settled:${submission.id}:${outcome}`,
      },
    });

    await recordActivity(db, {
      projectId,
      actorId,
      entityType: "submission",
      entityId: submission.id,
      action: outcome === "approved" ? "submission_approved" : "submission_rejected",
      summary: `${outcome} ${task?.code ?? "a submission"}`,
    });

    void projectAudience;
  },

  async pendingCount(db: Database, projectId: string) {
    const [row] = await db
      .select({ value: count() })
      .from(submissions)
      .where(and(eq(submissions.projectId, projectId), eq(submissions.status, "pending_review")));
    return row?.value ?? 0;
  },

  /** Submissions decided in a window, for the delivery throughput figure. */
  async throughput(db: Database, projectId: string, sinceDays: number) {
    const since = new Date(Date.now() - sinceDays * 86_400_000);

    return db
      .select({
        day: submissions.decidedAt,
        status: submissions.status,
      })
      .from(submissions)
      .where(
        and(
          eq(submissions.projectId, projectId),
          gte(submissions.decidedAt, since),
        ),
      );
  },
};

