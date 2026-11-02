import { eq } from "drizzle-orm";
import { createDatabase } from "./client.ts";
import { createAuth } from "./auth.ts";
import {
  checklistItems,
  departments,
  documents,
  labels,
  milestones,
  notifications,
  projectMembers,
  projects,
  submissionDecisions,
  submissionReviewers,
  submissions,
  taskApprovers,
  taskApprovalConfig,
  taskDependencies,
  taskLabels,
  tasks,
  templateDependencies,
  templateTasks,
  templates,
  users,
  workLogs,
} from "./schema/index.ts";
import { SchedulingService } from "../modules/scheduling/service.ts";
import { toDayNumber, fromDayNumber, shiftWorkingDays } from "../domain/scheduler.ts";

/**
 * Seeds a workspace that exercises every screen: a project mid-delivery with a
 * live critical path, a project that is late, one that is finished, a review
 * waiting on someone, and a Gantt with all four dependency types.
 *
 * The dates are relative to today, so the dashboard is meaningful whenever the
 * seed is run rather than frozen at whatever week it was written.
 */

const TODAY = new Date().toISOString().slice(0, 10);
const todayDay = toDayNumber(TODAY);

function day(offset: number): string {
  return fromDayNumber(shiftWorkingDays(todayDay, offset));
}

const PEOPLE = [
  { email: "admin@zerotask.dev", name: "Rani Prasetyo", role: "admin" as const, dept: "PMO", title: "Head of Delivery" },
  { email: "iman@zerotask.dev", name: "Iman Kusuma", role: "manager" as const, dept: "PMO", title: "Delivery Manager" },
  { email: "sari@zerotask.dev", name: "Sari Wulandari", role: "lead" as const, dept: "ENG", title: "Engineering Lead" },
  { email: "budi@zerotask.dev", name: "Budi Santoso", role: "staff" as const, dept: "ENG", title: "Backend Engineer" },
  { email: "dewi@zerotask.dev", name: "Dewi Anggraini", role: "staff" as const, dept: "ENG", title: "Frontend Engineer" },
  { email: "agus@zerotask.dev", name: "Agus Hermawan", role: "lead" as const, dept: "OPS", title: "Operations Lead" },
  { email: "putri@zerotask.dev", name: "Putri Handayani", role: "staff" as const, dept: "OPS", title: "Field Coordinator" },
  { email: "tono@zerotask.dev", name: "Tono Wijaya", role: "staff" as const, dept: "QA", title: "Test Engineer" },
];

const DEPARTMENTS = [
  { code: "PMO", name: "Project Management", color: "#17457F", dailyCapacityHours: 8, description: "Plans, schedules, and reports on delivery" },
  { code: "ENG", name: "Engineering", color: "#2A5B41", dailyCapacityHours: 8, description: "Builds and integrates the system" },
  { code: "OPS", name: "Operations", color: "#7A4A00", dailyCapacityHours: 8, description: "Site readiness, logistics, and rollout" },
  { code: "QA", name: "Quality", color: "#545B63", dailyCapacityHours: 8, description: "Verification, acceptance, and documentation" },
];

const PASSWORD = "zerotask-demo-2026";

async function main() {
  const database = await createDatabase();
  await database.migrate();
  const db = database.db;
  const auth = createAuth(db);

  const [existing] = await db.select({ id: users.id }).from(users).limit(1);
  if (existing) {
    console.log("Seed skipped: the database already has users.");
    console.log("Run `bun run db:reset` first if you want a clean workspace.");
    await database.close();
    return;
  }

  // Departments
  const departmentRows = await db.insert(departments).values(DEPARTMENTS).returning();
  const deptByCode = new Map(departmentRows.map((row) => [row.code, row.id]));

  // People. Sign-up goes through Better Auth so the credentials are real and the
  // demo accounts can actually be used to sign in.
  const personByEmail = new Map<string, { id: string; name: string }>();

  for (const person of PEOPLE) {
    const result = await auth.api.signUpEmail({
      body: { email: person.email, password: PASSWORD, name: person.name },
    });

    await db
      .update(users)
      .set({
        role: person.role,
        departmentId: deptByCode.get(person.dept) ?? null,
        jobTitle: person.title,
        weeklyHours: 40,
        emailVerified: true,
      })
      .where(eq(users.id, result.user.id));

    personByEmail.set(person.email, { id: result.user.id, name: person.name });
  }

  const id = (email: string) => personByEmail.get(email)!.id;

  // --- Project 1: mid-delivery, live critical path -------------------------

  const [atlas] = await db
    .insert(projects)
    .values({
      code: "ZR-001",
      name: "Atlas: warehouse rollout, phase 2",
      description:
        "Second warehouse goes live across three sites. Tracks receiving, putaway, and the integration with the existing WMS.",
      status: "active",
      ownerId: id("iman@zerotask.dev"),
      createdById: id("admin@zerotask.dev"),
      kickoffDate: day(-18),
      targetLaunchDate: day(24),
    })
    .returning();

  await db.insert(projectMembers).values([
    { projectId: atlas!.id, userId: id("iman@zerotask.dev"), role: "owner" },
    { projectId: atlas!.id, userId: id("sari@zerotask.dev"), role: "manager" },
    { projectId: atlas!.id, userId: id("budi@zerotask.dev"), role: "member" },
    { projectId: atlas!.id, userId: id("dewi@zerotask.dev"), role: "member" },
    { projectId: atlas!.id, userId: id("agus@zerotask.dev"), role: "member" },
    { projectId: atlas!.id, userId: id("putri@zerotask.dev"), role: "member" },
    { projectId: atlas!.id, userId: id("tono@zerotask.dev"), role: "member" },
    { projectId: atlas!.id, userId: id("admin@zerotask.dev"), role: "viewer" },
  ]);

  const atlasLabels = await db
    .insert(labels)
    .values([
      { projectId: atlas!.id, name: "site", color: "#7A4A00" },
      { projectId: atlas!.id, name: "integration", color: "#17457F" },
      { projectId: atlas!.id, name: "customer-visible", color: "#2A5B41" },
    ])
    .returning();
  const labelByName = new Map(atlasLabels.map((row) => [row.name, row.id]));

  const atlasMilestones = await db
    .insert(milestones)
    .values([
      { projectId: atlas!.id, name: "Site survey signed off", targetDate: day(-8), status: "completed", completedAt: new Date(), sortOrder: 0 },
      { projectId: atlas!.id, name: "Integration in staging", targetDate: day(6), status: "in_progress", sortOrder: 1 },
      { projectId: atlas!.id, name: "Go live", targetDate: day(24), status: "not_started", sortOrder: 2 },
    ])
    .returning();

  const atlasTasks = await db
    .insert(tasks)
    .values([
      {
        projectId: atlas!.id,
        code: "ZR-001-01",
        name: "Confirm racking layout with the site team",
        description: "Walk the floor with operations and mark every rack position that changes.",
        status: "completed",
        priority: "high",
        durationDays: 3,
        estimatedHours: "24",
        progressPercent: 100,
        plannedStartDate: day(-18),
        plannedEndDate: day(-16),
        actualStartDate: day(-18),
        actualEndDate: day(-16),
        assignedToId: id("putri@zerotask.dev"),
        reviewerId: id("agus@zerotask.dev"),
        departmentId: deptByCode.get("OPS"),
        milestoneId: atlasMilestones[0]!.id,
        sortOrder: 0,
      },
      {
        projectId: atlas!.id,
        code: "ZR-001-02",
        name: "Map WMS receiving events to the new payload",
        description: "Agree the field mapping with the WMS vendor before any code is written.",
        status: "completed",
        priority: "high",
        durationDays: 4,
        estimatedHours: "32",
        progressPercent: 100,
        plannedStartDate: day(-17),
        plannedEndDate: day(-12),
        actualStartDate: day(-17),
        actualEndDate: day(-13),
        assignedToId: id("budi@zerotask.dev"),
        reviewerId: id("sari@zerotask.dev"),
        departmentId: deptByCode.get("ENG"),
        sortOrder: 1,
      },
      {
        projectId: atlas!.id,
        code: "ZR-001-03",
        name: "Build the receiving adapter",
        description: "Consume WMS webhooks, normalize them, and write to the inbound queue.",
        status: "in_progress",
        priority: "critical",
        durationDays: 8,
        estimatedHours: "64",
        progressPercent: 55,
        plannedStartDate: day(-12),
        plannedEndDate: day(-2),
        actualStartDate: day(-12),
        assignedToId: id("budi@zerotask.dev"),
        reviewerId: id("sari@zerotask.dev"),
        departmentId: deptByCode.get("ENG"),
        milestoneId: atlasMilestones[1]!.id,
        sortOrder: 2,
      },
      {
        projectId: atlas!.id,
        code: "ZR-001-04",
        name: "Rack labelling and scan test",
        description: "Label every position and verify each scan resolves to one location.",
        status: "in_progress",
        priority: "medium",
        durationDays: 5,
        estimatedHours: "30",
        progressPercent: 40,
        plannedStartDate: day(-6),
        plannedEndDate: day(0),
        actualStartDate: day(-6),
        assignedToId: id("putri@zerotask.dev"),
        reviewerId: id("agus@zerotask.dev"),
        departmentId: deptByCode.get("OPS"),
        sortOrder: 3,
      },
      {
        projectId: atlas!.id,
        code: "ZR-001-05",
        name: "Load test the inbound queue at peak",
        description: "Sustain the peak receiving rate for an hour without dropping an event.",
        status: "not_started",
        priority: "high",
        durationDays: 3,
        estimatedHours: "24",
        plannedStartDate: day(1),
        assignedToId: id("tono@zerotask.dev"),
        reviewerId: id("sari@zerotask.dev"),
        departmentId: deptByCode.get("QA"),
        sortOrder: 4,
      },
      {
        projectId: atlas!.id,
        code: "ZR-001-06",
        name: "Train the receiving crew",
        description: "Two sessions covering receive, putaway, and exception handling.",
        status: "not_started",
        priority: "medium",
        durationDays: 2,
        estimatedHours: "16",
        plannedStartDate: day(9),
        assignedToId: id("agus@zerotask.dev"),
        reviewerId: id("iman@zerotask.dev"),
        departmentId: deptByCode.get("OPS"),
        sortOrder: 5,
      },
      {
        projectId: atlas!.id,
        code: "ZR-001-07",
        name: "Cut over and watch the first shift",
        description: "Switch traffic, keep the old path warm, and staff the floor for one full shift.",
        status: "not_started",
        priority: "critical",
        durationDays: 2,
        estimatedHours: "32",
        plannedStartDate: day(19),
        assignedToId: id("iman@zerotask.dev"),
        reviewerId: id("admin@zerotask.dev"),
        departmentId: deptByCode.get("PMO"),
        milestoneId: atlasMilestones[2]!.id,
        sortOrder: 6,
      },
      {
        projectId: atlas!.id,
        code: "ZR-001-08",
        name: "Draft the on-call runbook",
        description: "What to check, who to call, and how to roll back in the first 48 hours.",
        status: "blocked",
        priority: "medium",
        durationDays: 2,
        estimatedHours: "12",
        plannedStartDate: day(-3),
        plannedEndDate: day(2),
        assignedToId: id("dewi@zerotask.dev"),
        reviewerId: id("sari@zerotask.dev"),
        departmentId: deptByCode.get("ENG"),
        sortOrder: 7,
      },
    ])
    .returning();

  const taskByCode = new Map(atlasTasks.map((row) => [row.code, row]));

  await db.insert(taskDependencies).values([
    { projectId: atlas!.id, predecessorId: taskByCode.get("ZR-001-01")!.id, successorId: taskByCode.get("ZR-001-04")!.id, type: "fs", lagDays: 0 },
    { projectId: atlas!.id, predecessorId: taskByCode.get("ZR-001-02")!.id, successorId: taskByCode.get("ZR-001-03")!.id, type: "fs", lagDays: 0 },
    { projectId: atlas!.id, predecessorId: taskByCode.get("ZR-001-03")!.id, successorId: taskByCode.get("ZR-001-05")!.id, type: "fs", lagDays: 1 },
    { projectId: atlas!.id, predecessorId: taskByCode.get("ZR-001-03")!.id, successorId: taskByCode.get("ZR-001-08")!.id, type: "ss", lagDays: 4 },
    { projectId: atlas!.id, predecessorId: taskByCode.get("ZR-001-04")!.id, successorId: taskByCode.get("ZR-001-06")!.id, type: "fs", lagDays: 0 },
    { projectId: atlas!.id, predecessorId: taskByCode.get("ZR-001-05")!.id, successorId: taskByCode.get("ZR-001-07")!.id, type: "ff", lagDays: 2 },
    { projectId: atlas!.id, predecessorId: taskByCode.get("ZR-001-06")!.id, successorId: taskByCode.get("ZR-001-07")!.id, type: "fs", lagDays: 0 },
  ]);

  await db.insert(taskLabels).values([
    { taskId: taskByCode.get("ZR-001-03")!.id, labelId: labelByName.get("integration")! },
    { taskId: taskByCode.get("ZR-001-03")!.id, labelId: labelByName.get("customer-visible")! },
    { taskId: taskByCode.get("ZR-001-04")!.id, labelId: labelByName.get("site")! },
    { taskId: taskByCode.get("ZR-001-06")!.id, labelId: labelByName.get("site")! },
  ]);

  await db.insert(checklistItems).values([
    { taskId: taskByCode.get("ZR-001-03")!.id, title: "Webhook signature verified", done: true, sortOrder: 0 },
    { taskId: taskByCode.get("ZR-001-03")!.id, title: "Retry queue drains on vendor outage", done: true, sortOrder: 1 },
    { taskId: taskByCode.get("ZR-001-03")!.id, title: "Duplicate events ignored by idempotency key", done: false, sortOrder: 2 },
    { taskId: taskByCode.get("ZR-001-04")!.id, title: "Aisles A and B labelled", done: true, sortOrder: 0 },
    { taskId: taskByCode.get("ZR-001-04")!.id, title: "Aisles C and D labelled", done: false, sortOrder: 1 },
  ]);

  await db.insert(workLogs).values([
    { taskId: taskByCode.get("ZR-001-03")!.id, userId: id("budi@zerotask.dev"), logDate: day(-4), hours: "6", note: "Signature verification and the retry path" },
    { taskId: taskByCode.get("ZR-001-03")!.id, userId: id("budi@zerotask.dev"), logDate: day(-3), hours: "7.5", note: "Idempotency keys, half done" },
    { taskId: taskByCode.get("ZR-001-03")!.id, userId: id("budi@zerotask.dev"), logDate: day(-2), hours: "5", note: "Paired with Sari on the queue contract" },
    { taskId: taskByCode.get("ZR-001-04")!.id, userId: id("putri@zerotask.dev"), logDate: day(-3), hours: "8", note: "Aisles A and B, plus a re-scan pass" },
    { taskId: taskByCode.get("ZR-001-04")!.id, userId: id("putri@zerotask.dev"), logDate: day(-2), hours: "4", note: "Half of aisle C" },
    { taskId: taskByCode.get("ZR-001-08")!.id, userId: id("dewi@zerotask.dev"), logDate: day(-2), hours: "2", note: "Outlined the rollback steps" },
  ]);

  /**
   * ZR-001-03 is deliberately mid-review: it gives the reviewer queue, the
   * approval progress indicator, and the "awaiting review" filter real data.
   */
  const [pendingReview] = await db
    .insert(submissions)
    .values({
      taskId: taskByCode.get("ZR-001-03")!.id,
      projectId: atlas!.id,
      submittedById: id("budi@zerotask.dev"),
      kind: "progress",
      status: "pending_review",
      note: "Adapter handles webhooks and retries. Idempotency still open, so this is progress, not completion.",
      progressPercent: 55,
      hoursSpent: "18.5",
      requiredApprovals: 2,
      approvalMode: "any",
    })
    .returning();

  await db.insert(taskApprovalConfig).values({
    taskId: taskByCode.get("ZR-001-03")!.id,
    requiredApprovals: 2,
    approvalMode: "any",
  });

  await db.insert(taskApprovers).values([
    { taskId: taskByCode.get("ZR-001-03")!.id, userId: id("sari@zerotask.dev"), sortOrder: 0 },
    { taskId: taskByCode.get("ZR-001-03")!.id, userId: id("iman@zerotask.dev"), sortOrder: 1 },
  ]);

  await db.insert(submissionReviewers).values([
    { submissionId: pendingReview!.id, userId: id("sari@zerotask.dev"), sortOrder: 0 },
    { submissionId: pendingReview!.id, userId: id("iman@zerotask.dev"), sortOrder: 1 },
  ]);

  // A decided submission, so the history tab is not empty.
  const [reviewed] = await db
    .insert(submissions)
    .values({
      taskId: taskByCode.get("ZR-001-02")!.id,
      projectId: atlas!.id,
      submittedById: id("budi@zerotask.dev"),
      kind: "completion",
      status: "approved",
      note: "Field mapping signed off by the vendor. Document attached.",
      progressPercent: 100,
      hoursSpent: "30",
      requiredApprovals: 1,
      approvalMode: "any",
      decidedAt: new Date(),
    })
    .returning();

  await db.insert(submissionReviewers).values({
    submissionId: reviewed!.id,
    userId: id("sari@zerotask.dev"),
    sortOrder: 0,
  });
  await db.insert(submissionDecisions).values({
    submissionId: reviewed!.id,
    reviewerId: id("sari@zerotask.dev"),
    decision: "approved",
    note: "Matches the vendor sheet exactly.",
  });

  // --- Project 2: late, to exercise the at-risk signal ---------------------

  const [borealis] = await db
    .insert(projects)
    .values({
      code: "ZR-002",
      name: "Borealis: cold chain retro-fit",
      description:
        "Retro-fit the north distribution centre with temperature monitoring. Regulatory sign-off is the hard constraint.",
      status: "on_hold",
      ownerId: id("sari@zerotask.dev"),
      createdById: id("admin@zerotask.dev"),
      kickoffDate: day(-40),
      targetLaunchDate: day(3),
    })
    .returning();

  await db.insert(projectMembers).values([
    { projectId: borealis!.id, userId: id("sari@zerotask.dev"), role: "owner" },
    { projectId: borealis!.id, userId: id("agus@zerotask.dev"), role: "manager" },
    { projectId: borealis!.id, userId: id("putri@zerotask.dev"), role: "member" },
    { projectId: borealis!.id, userId: id("tono@zerotask.dev"), role: "member" },
  ]);

  const borealisTasks = await db
    .insert(tasks)
    .values([
      {
        projectId: borealis!.id,
        code: "ZR-002-01",
        name: "Sensor installation across all racks",
        status: "in_progress",
        priority: "high",
        durationDays: 12,
        progressPercent: 70,
        plannedStartDate: day(-30),
        plannedEndDate: day(-10),
        actualStartDate: day(-30),
        assignedToId: id("putri@zerotask.dev"),
        reviewerId: id("agus@zerotask.dev"),
        departmentId: deptByCode.get("OPS"),
        sortOrder: 0,
      },
      {
        projectId: borealis!.id,
        code: "ZR-002-02",
        name: "Calibration certificate for each sensor",
        status: "blocked",
        priority: "critical",
        durationDays: 5,
        progressPercent: 20,
        plannedStartDate: day(-8),
        plannedEndDate: day(-1),
        actualStartDate: day(-8),
        assignedToId: id("tono@zerotask.dev"),
        reviewerId: id("sari@zerotask.dev"),
        departmentId: deptByCode.get("QA"),
        sortOrder: 1,
      },
      {
        projectId: borealis!.id,
        code: "ZR-002-03",
        name: "Regulatory submission",
        status: "not_started",
        priority: "critical",
        durationDays: 4,
        plannedStartDate: day(2),
        assignedToId: id("sari@zerotask.dev"),
        reviewerId: id("admin@zerotask.dev"),
        departmentId: deptByCode.get("PMO"),
        sortOrder: 2,
      },
    ])
    .returning();

  await db.insert(taskDependencies).values([
    { projectId: borealis!.id, predecessorId: borealisTasks[0]!.id, successorId: borealisTasks[1]!.id, type: "fs", lagDays: 0 },
    { projectId: borealis!.id, predecessorId: borealisTasks[1]!.id, successorId: borealisTasks[2]!.id, type: "fs", lagDays: 0 },
  ]);

  // --- Project 3: finished, so the archive and the completed state exist ---

  const [cirrus] = await db
    .insert(projects)
    .values({
      code: "ZR-003",
      name: "Cirrus: supplier portal onboarding",
      description: "Ten suppliers moved onto the new portal. Closed after acceptance.",
      status: "completed",
      ownerId: id("iman@zerotask.dev"),
      createdById: id("admin@zerotask.dev"),
      kickoffDate: day(-70),
      targetLaunchDate: day(-14),
    })
    .returning();

  await db.insert(projectMembers).values([
    { projectId: cirrus!.id, userId: id("iman@zerotask.dev"), role: "owner" },
    { projectId: cirrus!.id, userId: id("dewi@zerotask.dev"), role: "member" },
  ]);

  await db.insert(tasks).values({
    projectId: cirrus!.id,
    code: "ZR-003-01",
    name: "Onboard all ten suppliers",
    status: "completed",
    priority: "medium",
    durationDays: 15,
    progressPercent: 100,
    plannedStartDate: day(-60),
    plannedEndDate: day(-40),
    actualStartDate: day(-60),
    actualEndDate: day(-42),
    assignedToId: id("dewi@zerotask.dev"),
    reviewerId: id("iman@zerotask.dev"),
    departmentId: deptByCode.get("ENG"),
    sortOrder: 0,
  });

  // --- Project 4: draft, to exercise the "not started yet" empty state -----

  await db.insert(projects).values({
    code: "ZR-004",
    name: "Delta: returns handling review",
    description: "Scope not agreed yet. Captures the open questions from the operations workshop.",
    status: "draft",
    ownerId: id("admin@zerotask.dev"),
    createdById: id("admin@zerotask.dev"),
    kickoffDate: null,
    targetLaunchDate: day(60),
  });

  // --- Documents ----------------------------------------------------------

  await db.insert(documents).values([
    {
      projectId: atlas!.id,
      taskId: taskByCode.get("ZR-001-02")!.id,
      code: "DOC-001",
      name: "WMS field mapping, signed",
      kind: "spec",
      version: "1.2",
      note: "Signed by the vendor on the call. Supersedes 1.1.",
      uploadedById: id("budi@zerotask.dev"),
    },
    {
      projectId: atlas!.id,
      taskId: taskByCode.get("ZR-001-04")!.id,
      code: "DOC-002",
      name: "Aisle A and B scan log",
      kind: "checklist",
      version: "1.0",
      uploadedById: id("putri@zerotask.dev"),
    },
    {
      projectId: borealis!.id,
      code: "DOC-003",
      name: "Sensor calibration certificates, batch 1",
      kind: "report",
      version: "1.0",
      note: "Batch 2 is still with the supplier.",
      uploadedById: id("tono@zerotask.dev"),
    },
  ]);

  // --- Templates ----------------------------------------------------------

  const [rolloutTemplate] = await db
    .insert(templates)
    .values({
      code: "TPL-001",
      name: "Warehouse rollout",
      description: "The shape of a site go-live: survey, integration, labelling, load test, training, cutover.",
      category: "operations",
      createdById: id("admin@zerotask.dev"),
    })
    .returning();

  const templateTaskRows = await db
    .insert(templateTasks)
    .values([
      { templateId: rolloutTemplate!.id, code: "T-01", name: "Site survey and racking layout", durationDays: 3, priority: "high", sortOrder: 0 },
      { templateId: rolloutTemplate!.id, code: "T-02", name: "Integration field mapping", durationDays: 4, priority: "high", sortOrder: 1 },
      { templateId: rolloutTemplate!.id, code: "T-03", name: "Build the integration adapter", durationDays: 8, priority: "critical", sortOrder: 2 },
      { templateId: rolloutTemplate!.id, code: "T-04", name: "Label and scan test", durationDays: 5, priority: "medium", sortOrder: 3 },
      { templateId: rolloutTemplate!.id, code: "T-05", name: "Load test at peak", durationDays: 3, priority: "high", sortOrder: 4 },
      { templateId: rolloutTemplate!.id, code: "T-06", name: "Train the receiving crew", durationDays: 2, priority: "medium", sortOrder: 5 },
      { templateId: rolloutTemplate!.id, code: "T-07", name: "Cutover and first shift", durationDays: 2, priority: "critical", sortOrder: 6 },
    ])
    .returning();

  const templateByCode = new Map(templateTaskRows.map((row) => [row.code, row.id]));

  await db.insert(templateDependencies).values([
    { templateId: rolloutTemplate!.id, predecessorId: templateByCode.get("T-01")!, successorId: templateByCode.get("T-04")!, type: "fs", lagDays: 0 },
    { templateId: rolloutTemplate!.id, predecessorId: templateByCode.get("T-02")!, successorId: templateByCode.get("T-03")!, type: "fs", lagDays: 0 },
    { templateId: rolloutTemplate!.id, predecessorId: templateByCode.get("T-03")!, successorId: templateByCode.get("T-05")!, type: "fs", lagDays: 1 },
    { templateId: rolloutTemplate!.id, predecessorId: templateByCode.get("T-04")!, successorId: templateByCode.get("T-06")!, type: "fs", lagDays: 0 },
    { templateId: rolloutTemplate!.id, predecessorId: templateByCode.get("T-05")!, successorId: templateByCode.get("T-07")!, type: "fs", lagDays: 0 },
    { templateId: rolloutTemplate!.id, predecessorId: templateByCode.get("T-06")!, successorId: templateByCode.get("T-07")!, type: "fs", lagDays: 0 },
  ]);

  await db.insert(templates).values({
    code: "TPL-002",
    name: "Compliance submission",
    description: "Preparing and filing a regulatory submission, with a review gate before filing.",
    category: "compliance",
    createdById: id("admin@zerotask.dev"),
  });

  // --- Run the scheduler so the Gantt and critical path are real ----------

  for (const project of [atlas!, borealis!, cirrus!]) {
    await SchedulingService.recalculate(db, project.id, id("admin@zerotask.dev"), { silent: true });
  }

  // --- A few notifications, so the bell has content -----------------------

  await db.insert(notifications).values([
    {
      userId: id("sari@zerotask.dev"),
      kind: "review",
      title: "ZR-001-03 is ready for review",
      body: "Adapter handles webhooks and retries. Idempotency still open.",
      href: `/projects/${atlas!.id}/tasks/${taskByCode.get("ZR-001-03")!.id}`,
      projectId: atlas!.id,
    },
    {
      userId: id("iman@zerotask.dev"),
      kind: "review",
      title: "ZR-001-03 is ready for review",
      body: "Adapter handles webhooks and retries. Idempotency still open.",
      href: `/projects/${atlas!.id}/tasks/${taskByCode.get("ZR-001-03")!.id}`,
      projectId: atlas!.id,
    },
    {
      userId: id("sari@zerotask.dev"),
      kind: "dependency",
      title: "ZR-002-02 is blocked",
      body: "Waiting on the supplier's second calibration batch.",
      href: `/projects/${borealis!.id}/tasks/${borealisTasks[1]!.id}`,
      projectId: borealis!.id,
    },
  ]);

  console.log("Seed complete.");
  console.log(`  people:    ${PEOPLE.length}`);
  console.log(`  projects:  4`);
  console.log(`  tasks:     ${atlasTasks.length + borealisTasks.length + 1}`);
  console.log(`  password:  ${PASSWORD} (every account)`);
  console.log("");
  console.log("  Sign in as:");
  console.log("    admin@zerotask.dev  admin");
  console.log("    iman@zerotask.dev   manager, owns ZR-001");
  console.log("    sari@zerotask.dev   lead, owns ZR-002, has a review waiting");
  console.log("    budi@zerotask.dev   staff, assignee on the live critical path");

  await database.close();
}

main().catch((error) => {
  console.error("Seed failed", error);
  process.exit(1);
});


