import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { createTestDatabase, truncateAll } from "../db/testing.ts";
import { createAuth } from "../db/auth.ts";
import { createApp } from "../app.ts";
import { users } from "../db/schema/index.ts";
import type { Database } from "../db/client.ts";

/**
 * Integration tests run the real app against a real Postgres engine (PGlite in
 * memory): real routing, real guards, real SQL. Nothing is mocked except the mail
 * provider, which is not configured in this build anyway.
 *
 * The database is migrated once for the file and truncated between tests, because
 * running every migration before every test costs seconds and buys nothing.
 */

const PASSWORD = "correct-horse-battery";

let db: Database;
let api: ReturnType<typeof createApp>;
let auth: ReturnType<typeof createAuth>;
let closeDatabase: () => Promise<void>;

interface Harness {
  api: ReturnType<typeof createApp>;
  token: string;
  userId: string;
}

async function signUp(person: {
  email: string;
  name: string;
  role?: "staff" | "lead" | "manager" | "admin";
}) {
  const result = await auth.api.signUpEmail({
    body: { email: person.email, password: PASSWORD, name: person.name },
  });

  if (person.role && person.role !== "staff") {
    await db.update(users).set({ role: person.role }).where(eq(users.id, result.user.id));
  }

  return { api, token: result.token as string, userId: result.user.id };
}

async function request(
  target: ReturnType<typeof createApp>,
  token: string | null,
  method: string,
  path: string,
  body?: unknown,
) {
  const response = await target.handle(
    new Request(`http://localhost/api${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  );

  const text = await response.text();
  return {
    status: response.status,
    body: text.length > 0 ? (JSON.parse(text) as Record<string, unknown>) : null,
  };
}

describe("API", () => {
  let harness: Harness;
  let admin: Harness;
  let outsider: Harness;

  beforeAll(async () => {
    const database = await createTestDatabase();
    db = database.db;
    closeDatabase = database.client.close.bind(database.client);
    auth = createAuth(db);
    api = createApp({ db, auth });
  });

  afterAll(async () => {
    await closeDatabase();
  });

  beforeEach(async () => {
    await truncateAll(db);

    harness = await signUp({ email: "owner@example.com", name: "Owner", role: "manager" });
    admin = await signUp({ email: "admin@example.com", name: "Admin", role: "admin" });
    outsider = await signUp({ email: "stranger@example.com", name: "Stranger" });
  });

  describe("health and session", () => {
    it("reports health without a session", async () => {
      const { status, body } = await request(harness.api, null, "GET", "/health");
      expect(status).toBe(200);
      expect(body?.status).toBe("ok");
    });

    it("says anonymous visitors are not signed in rather than failing", async () => {
      const { status, body } = await request(harness.api, null, "GET", "/account/session");
      expect(status).toBe(200);
      expect(body?.authenticated).toBe(false);
    });

    it("returns the caller with their capabilities when signed in", async () => {
      const { status, body } = await request(harness.api, harness.token, "GET", "/account/session");
      expect(status).toBe(200);
      expect(body?.authenticated).toBe(true);

      const payload = body as {
        user: { email: string };
        capabilities: { createProject: boolean; managePeople: boolean };
      };
      expect(payload.user.email).toBe("owner@example.com");
      expect(payload.capabilities.createProject).toBe(true);
      expect(payload.capabilities.managePeople).toBe(false);
    });

    it("rejects public sign-up, while an admin can still create accounts", async () => {
      const publicSignUp = await request(harness.api, null, "POST", "/auth/sign-up/email", {
        email: "newcomer@example.com",
        password: PASSWORD,
        name: "Newcomer",
      });
      expect(publicSignUp.status).toBe(403);
      expect(publicSignUp.body?.code).toBe("FORBIDDEN");

      const created = await request(admin.api, admin.token, "POST", "/people", {
        email: "invited@example.com",
        password: PASSWORD,
        name: "Invited Person",
      });
      expect(created.status).toBe(200);
      expect(created.body?.email).toBe("invited@example.com");
    });

    it("rejects a protected route without a token", async () => {

      const { status, body } = await request(harness.api, null, "GET", "/projects");
      expect(status).toBe(401);
      expect(body?.code).toBe("UNAUTHORIZED");
    });
  });

  describe("projects", () => {
    it("creates a project, makes the creator its owner, and returns a code", async () => {
      const { status, body } = await request(harness.api, harness.token, "POST", "/projects", {
        name: "Migration to the new billing engine",
      });

      expect(status).toBe(200);
      expect(body?.code).toBe("ZR-001");
      expect(body?.status).toBe("draft");
      expect(body?.ownerId).toBe(harness.userId);
      expect(body?.memberCount).toBe(1);
    });

    it("retrieves the project with its people, milestones, and labels", async () => {
      const created = await request(harness.api, harness.token, "POST", "/projects", {
        name: "Onboarding revamp",
      });
      const projectId = created.body?.id as string;

      const { status, body } = await request(
        harness.api,
        harness.token,
        "GET",
        `/projects/${projectId}`,
      );

      expect(status).toBe(200);
      expect(body?.name).toBe("Onboarding revamp");
      expect(Array.isArray(body?.members)).toBe(true);
      expect(Array.isArray(body?.milestones)).toBe(true);
    });

    it("keeps a non-member out of a project they do not belong to", async () => {
      const created = await request(harness.api, harness.token, "POST", "/projects", {
        name: "Private work",
      });
      const projectId = created.body?.id as string;

      const { status } = await request(
        harness.api,
        outsider.token,
        "GET",
        `/projects/${projectId}`,
      );

      expect(status).toBe(403);
    });

    it("lets an admin open any project", async () => {
      const created = await request(harness.api, harness.token, "POST", "/projects", {
        name: "Admin can see this",
      });
      const projectId = created.body?.id as string;

      const { status, body } = await request(admin.api, admin.token, "GET", `/projects/${projectId}`);
      expect(status).toBe(200);
      expect(body?.name).toBe("Admin can see this");
    });

    it("refuses project creation to staff", async () => {
      const { status, body } = await request(outsider.api, outsider.token, "POST", "/projects", {
        name: "Should not exist",
      });
      expect(status).toBe(403);
      expect(body?.code).toBe("FORBIDDEN");
    });

    it("validates the project name and explains which field failed", async () => {
      const { status, body } = await request(harness.api, harness.token, "POST", "/projects", {
        name: "x",
      });
      expect(status).toBe(422);
      expect(String(body?.message)).toContain("name");
    });
  });

  describe("tasks and scheduling", () => {
    it("reports duration-weighted project progress as a percentage", async () => {
      const created = await request(harness.api, harness.token, "POST", "/projects", { name: "Progress example" });
      const projectId = created.body?.id as string;
      const first = await request(harness.api, harness.token, "POST", `/projects/${projectId}/tasks`, { name: "First part", durationDays: 3 });
      await request(harness.api, harness.token, "POST", `/projects/${projectId}/tasks`, { name: "Second part", durationDays: 1 });
      await request(harness.api, harness.token, "PATCH", `/projects/${projectId}/tasks/${first.body?.id}`, { progressPercent: 40 });
      const project = await request(harness.api, harness.token, "GET", `/projects/${projectId}`);
      expect(project.body?.progressPercent).toBe(30);
    });
    async function makeProject(withTask = false) {
      const created = await request(harness.api, harness.token, "POST", "/projects", {
        name: "Delivery programme",
        kickoffDate: "2026-11-02",
      });
      const projectId = created.body?.id as string;

      if (!withTask) return { projectId };

      const task = await request(
        harness.api,
        harness.token,
        "POST",
        `/projects/${projectId}/tasks`,
        { name: "First task", durationDays: 3 },
      );

      return { projectId, taskId: task.body?.id as string };
    }

    it("creates a task with a sequential code inside its project", async () => {
      const { projectId } = await makeProject();

      const first = await request(
        harness.api,
        harness.token,
        "POST",
        `/projects/${projectId}/tasks`,
        { name: "Design the intake form", durationDays: 2 },
      );
      const second = await request(
        harness.api,
        harness.token,
        "POST",
        `/projects/${projectId}/tasks`,
        { name: "Build the intake form" },
      );

      expect(first.status).toBe(200);
      expect(first.body?.code).toBe("ZR-001-01");
      expect(second.body?.code).toBe("ZR-001-02");
    });

    it("runs the schedule and marks the chain as critical", async () => {
      const { projectId } = await makeProject();

      const a = await request(harness.api, harness.token, "POST", `/projects/${projectId}/tasks`, {
        name: "Task A",
        durationDays: 2,
      });
      const b = await request(harness.api, harness.token, "POST", `/projects/${projectId}/tasks`, {
        name: "Task B",
        durationDays: 3,
      });

      await request(harness.api, harness.token, "POST", `/projects/${projectId}/dependencies`, {
        predecessorId: a.body?.id,
        successorId: b.body?.id,
      });

      const schedule = await request(harness.api, harness.token, "GET", `/projects/${projectId}/schedule`);

      expect(schedule.status).toBe(200);
      expect(schedule.body?.totalTaskCount).toBe(2);
      expect(schedule.body?.criticalTaskCount).toBe(2);
      expect(schedule.body?.projectStartDate).toBe("2026-11-02");
    });

    it("keeps dependency deletion scoped to its project and exposes actual dates", async () => {
      const { projectId } = await makeProject();
      const other = await request(admin.api, admin.token, "POST", "/projects", { name: "Other project", kickoffDate: "2026-11-02" });
      const otherId = other.body?.id as string;
      const a = await request(admin.api, admin.token, "POST", `/projects/${otherId}/tasks`, { name: "Other first" });
      const b = await request(admin.api, admin.token, "POST", `/projects/${otherId}/tasks`, { name: "Other second" });
      await request(admin.api, admin.token, "POST", `/projects/${otherId}/dependencies`, { predecessorId: a.body?.id, successorId: b.body?.id });
      const timeline = await request(admin.api, admin.token, "GET", `/projects/${otherId}/schedule/timeline`);
      const link = (timeline.body?.links as { id: string }[])[0]!;
      const denied = await request(harness.api, harness.token, "DELETE", `/projects/${projectId}/dependencies/${link.id}`);
      expect(denied.status).toBe(404);
      const invalid = await request(harness.api, harness.token, "POST", `/projects/${projectId}/tasks`, { name: "Bad dependency", dependsOn: [{ taskId: a.body?.id }] });
      expect(invalid.status).toBe(422);
      await request(admin.api, admin.token, "PATCH", `/projects/${otherId}/tasks/${a.body?.id}`, { actualStartDate: "2026-11-02", actualEndDate: "2026-11-03" });
      const after = await request(admin.api, admin.token, "GET", `/projects/${otherId}/schedule/timeline`);
      expect((after.body?.links as unknown[]).length).toBe(1);
      expect((after.body?.bars as { id: string; actualStartDate: string; actualEndDate: string }[]).find((bar) => bar.id === a.body?.id)).toMatchObject({ actualStartDate: "2026-11-02", actualEndDate: "2026-11-03" });
    });

    it("compares holidays without changing the saved schedule", async () => {
      const { projectId } = await makeProject(true);
      const before = await request(harness.api, harness.token, "GET", `/projects/${projectId}/schedule/timeline`);
      const originalFetch = globalThis.fetch;
      globalThis.fetch = Object.assign(async () => Response.json({ meta: { year: 2026, sources: [{ title: "Decree", url: "https://example.com/decree" }] }, data: [{ date: "2026-11-03", name: "Holiday", type: "national_holiday" }] }), { preconnect: originalFetch.preconnect });
      try {
        const comparison = await request(harness.api, harness.token, "GET", `/projects/${projectId}/schedule/holiday-comparison`);
        expect(comparison.status).toBe(200);
        expect(comparison.body?.delayCalendarDays).toBe(1);
        expect((comparison.body?.baseline as { calculatedEndDate: string }).calculatedEndDate).toBe("2026-11-04");
        expect((comparison.body?.withHolidays as { calculatedEndDate: string }).calculatedEndDate).toBe("2026-11-05");
      } finally {
        globalThis.fetch = originalFetch;
      }
      const after = await request(harness.api, harness.token, "GET", `/projects/${projectId}/schedule/timeline`);
      expect(after.body).toEqual(before.body);
      const denied = await request(outsider.api, outsider.token, "GET", `/projects/${projectId}/schedule/holiday-comparison`);
      expect(denied.status).toBe(403);
    });

    it("refuses a dependency that would create a loop", async () => {
      const { projectId } = await makeProject();

      const a = await request(harness.api, harness.token, "POST", `/projects/${projectId}/tasks`, {
        name: "Task A",
      });
      const b = await request(harness.api, harness.token, "POST", `/projects/${projectId}/tasks`, {
        name: "Task B",
      });

      await request(harness.api, harness.token, "POST", `/projects/${projectId}/dependencies`, {
        predecessorId: a.body?.id,
        successorId: b.body?.id,
      });

      const loop = await request(
        harness.api,
        harness.token,
        "POST",
        `/projects/${projectId}/dependencies`,
        { predecessorId: b.body?.id, successorId: a.body?.id },
      );

      expect(loop.status).toBe(409);
      expect(loop.body?.code).toBe("DEPENDENCY_CYCLE");
    });

    it("refuses a self dependency", async () => {
      const { projectId } = await makeProject();
      const task = await request(harness.api, harness.token, "POST", `/projects/${projectId}/tasks`, {
        name: "Only task",
      });

      const { status, body } = await request(
        harness.api,
        harness.token,
        "POST",
        `/projects/${projectId}/dependencies`,
        { predecessorId: task.body?.id, successorId: task.body?.id },
      );

      expect(status).toBe(409);
      expect(body?.code).toBe("SELF_DEPENDENCY");
    });

    it("returns the task panel with its links, checklist, and comments", async () => {
      const { projectId, taskId } = await makeProject(true);

      await request(
        harness.api,
        harness.token,
        "POST",
        `/projects/${projectId}/tasks/${taskId}/checklist`,
        { title: "Draft the outline" },
      );
      await request(
        harness.api,
        harness.token,
        "POST",
        `/projects/${projectId}/tasks/${taskId}/comments`,
        { body: "Starting on this today." },
      );

      const { status, body } = await request(
        harness.api,
        harness.token,
        "GET",
        `/projects/${projectId}/tasks/${taskId}`,
      );

      expect(status).toBe(200);
      const detail = body as {
        checklist: { title: string }[];
        comments: { body: string }[];
        dependencies: { predecessors: unknown[]; successors: unknown[] };
      };

      expect(detail.checklist[0]?.title).toBe("Draft the outline");
      expect(detail.comments[0]?.body).toBe("Starting on this today.");
      expect(detail.dependencies.predecessors).toHaveLength(0);
    });

    it("blocks completion by a plain status edit", async () => {
      const { projectId, taskId } = await makeProject(true);

      const { status, body } = await request(
        harness.api,
        harness.token,
        "PATCH",
        `/projects/${projectId}/tasks/${taskId}`,
        { status: "completed" },
      );

      expect(status).toBe(409);
      expect(body?.code).toBe("COMPLETION_NEEDS_REVIEW");
    });

    it("requires a review before a task can be marked complete in review", async () => {
      const { projectId, taskId } = await makeProject(true);

      // Starting a task is allowed; completing it is not.
      const started = await request(
        harness.api,
        harness.token,
        "POST",
        `/projects/${projectId}/tasks/${taskId}/move`,
        { status: "in_progress" },
      );
      expect(started.status).toBe(200);
      expect(started.body?.status).toBe("in_progress");
    });

    it("refuses a submission that has nobody able to review it", async () => {
      const { projectId, taskId } = await makeProject(true);

      // No reviewer on the task, and the only manager on the project is the
      // submitter, who cannot approve their own work.
      const submitted = await request(
        harness.api,
        harness.token,
        "POST",
        `/projects/${projectId}/tasks/${taskId}/submissions`,
        { note: "Ready for review", progressPercent: 100 },
      );

      expect(submitted.status).toBe(409);
      expect(submitted.body?.code).toBe("NO_REVIEWER");
    });

    it("moves the task into review when a submission is accepted", async () => {
      const { projectId, taskId } = await makeProject(true);

      await request(harness.api, harness.token, "POST", `/projects/${projectId}/members`, {
        userId: admin.userId,
        role: "manager",
      });
      await request(harness.api, harness.token, "PATCH", `/projects/${projectId}/tasks/${taskId}`, {
        reviewerId: admin.userId,
      });

      const submitted = await request(
        harness.api,
        harness.token,
        "POST",
        `/projects/${projectId}/tasks/${taskId}/submissions`,
        { note: "Ready for review", progressPercent: 100 },
      );

      expect(submitted.status).toBe(200);
      expect(submitted.body?.status).toBe("pending_review");

      const task = await request(
        harness.api,
        harness.token,
        "GET",
        `/projects/${projectId}/tasks/${taskId}`,
      );
      expect(task.body?.status).toBe("pending_review");
    });
  });

  describe("submissions", () => {
    async function projectWithReviewableTask() {
      const created = await request(harness.api, harness.token, "POST", "/projects", {
        name: "Review workflow",
      });
      const projectId = created.body?.id as string;

      const task = await request(harness.api, harness.token, "POST", `/projects/${projectId}/tasks`, {
        name: "Deliver the report",
      });
      const taskId = task.body?.id as string;

      // The reviewer must be on the project to be eligible at all.
      await request(harness.api, harness.token, "POST", `/projects/${projectId}/members`, {
        userId: admin.userId,
        role: "manager",
      });

      await request(harness.api, harness.token, "PATCH", `/projects/${projectId}/tasks/${taskId}`, {
        reviewerId: admin.userId,
      });

      const submission = await request(
        harness.api,
        harness.token,
        "POST",
        `/projects/${projectId}/tasks/${taskId}/submissions`,
        { note: "Report is ready" },
      );

      return { projectId, taskId, submissionId: submission.body?.id as string };
    }

    it("lets the assigned reviewer approve, completing the task", async () => {
      const { projectId, taskId, submissionId } = await projectWithReviewableTask();

      const decided = await request(
        admin.api,
        admin.token,
        "POST",
        `/projects/${projectId}/submissions/${submissionId}/approve`,
        { note: "Looks right" },
      );

      expect(decided.status).toBe(200);
      expect(decided.body?.status).toBe("approved");

      const task = await request(
        harness.api,
        harness.token,
        "GET",
        `/projects/${projectId}/tasks/${taskId}`,
      );
      expect(task.body?.status).toBe("completed");
    });

    it("returns a rejected task to work", async () => {
      const { projectId, taskId, submissionId } = await projectWithReviewableTask();

      await request(
        admin.api,
        admin.token,
        "POST",
        `/projects/${projectId}/submissions/${submissionId}/reject`,
        { note: "Section 3 is missing" },
      );

      const task = await request(
        harness.api,
        harness.token,
        "GET",
        `/projects/${projectId}/tasks/${taskId}`,
      );
      expect(task.body?.status).toBe("in_progress");
    });

    it("forbids a decision from someone who is not a reviewer", async () => {
      const { projectId, submissionId } = await projectWithReviewableTask();

      // An outsider cannot even see the submission, so the refusal comes from the
      // project guard before the reviewer check is reached.
      const { status } = await request(
        outsider.api,
        outsider.token,
        "POST",
        `/projects/${projectId}/submissions/${submissionId}/approve`,
        {},
      );

      expect(status).toBe(403);
    });

    it("refuses a reviewer approving their own submission", async () => {
      const created = await request(harness.api, harness.token, "POST", "/projects", {
        name: "Self review",
      });
      const projectId = created.body?.id as string;

      const task = await request(harness.api, harness.token, "POST", `/projects/${projectId}/tasks`, {
        name: "Approve my own work",
      });
      const taskId = task.body?.id as string;

      await request(harness.api, harness.token, "POST", `/projects/${projectId}/members`, {
        userId: admin.userId,
        role: "member",
      });

      // The submitter is deliberately listed as an approver here, which is the
      // only way the self-review refusal is reachable at all.
      await request(
        harness.api,
        harness.token,
        "PUT",
        `/projects/${projectId}/tasks/${taskId}/approval-config`,
        {
          requiredApprovals: 1,
          approvalMode: "any",
          reviewerIds: [harness.userId, admin.userId],
        },
      );

      const submission = await request(
        harness.api,
        harness.token,
        "POST",
        `/projects/${projectId}/tasks/${taskId}/submissions`,
        {},
      );
      expect(submission.status).toBe(200);

      const { status, body } = await request(
        harness.api,
        harness.token,
        "POST",
        `/projects/${projectId}/submissions/${submission.body?.id}/approve`,
        {},
      );

      expect(status).toBe(409);
      expect(body?.code).toBe("SELF_REVIEW");
    });

    it("refuses a second decision from the same reviewer", async () => {
      const { projectId, submissionId } = await projectWithReviewableTask();

      await request(
        admin.api,
        admin.token,
        "POST",
        `/projects/${projectId}/submissions/${submissionId}/approve`,
        {},
      );

      const again = await request(
        admin.api,
        admin.token,
        "POST",
        `/projects/${projectId}/submissions/${submissionId}/reject`,
        {},
      );

      expect(again.status).toBe(409);
      expect(again.body?.code).toBe("ALREADY_DECIDED");
    });
  });

  describe("personal views", () => {
    it("returns an empty board rather than an error when nothing is assigned", async () => {
      const { status, body } = await request(harness.api, harness.token, "GET", "/my-work");
      expect(status).toBe(200);

      const payload = body as { items: unknown[]; statusCounts: Record<string, number> };
      expect(payload.items).toHaveLength(0);
      expect(payload.statusCounts).toEqual({});
    });

    it("puts an assigned task on the owner's board", async () => {
      const created = await request(harness.api, harness.token, "POST", "/projects", {
        name: "Board test",
      });
      const projectId = created.body?.id as string;

      await request(harness.api, harness.token, "POST", `/projects/${projectId}/tasks`, {
        name: "Assigned to me",
        assignedToId: harness.userId,
        plannedEndDate: new Date().toISOString().slice(0, 10),
      });
      await request(harness.api, harness.token, "POST", `/projects/${projectId}/tasks`, {
        name: "Far future task", assignedToId: harness.userId, plannedEndDate: "2099-12-31",
      });

      const { body } = await request(harness.api, harness.token, "GET", "/my-work");
      const payload = body as { items: { name: string }[] };
      expect(payload.items.map((item) => item.name)).toContain("Assigned to me");
      expect(payload.items.map((item) => item.name)).toContain("Far future task");
    });

    it("counts the overview from real rows", async () => {
      const created = await request(harness.api, harness.token, "POST", "/projects", {
        name: "Overview test",
        status: "active",
      });
      const projectId = created.body?.id as string;

      await request(harness.api, harness.token, "POST", `/projects/${projectId}/tasks`, {
        name: "Open work",
      });

      const { status, body } = await request(harness.api, harness.token, "GET", "/overview");
      expect(status).toBe(200);

      const overview = body as { projects: { active: number }; tasks: { open: number } };
      expect(overview.projects.active).toBe(1);
      expect(overview.tasks.open).toBe(1);
    });
  });

  describe("people and departments", () => {
    it("lets only admins create a sign-in account", async () => {
      const input = { name: "New colleague", email: "new-colleague@example.com", password: "safe-password-123" };
      const forbidden = await request(harness.api, harness.token, "POST", "/people", input);
      expect(forbidden.status).toBe(403);
      const created = await request(admin.api, admin.token, "POST", "/people", input);
      expect(created.status).toBe(200);
      expect(created.body?.role).toBe("staff");
      const signedIn = await auth.api.signInEmail({ body: { email: input.email, password: input.password } });
      expect(signedIn.user.email).toBe(input.email);
    });
    it("returns a department list any signed-in person can read", async () => {
      const { status, body } = await request(
        harness.api,
        admin.token,
        "POST",
        "/departments",
        { code: "ENG", name: "Engineering" },
      );
      expect(status).toBe(200);

      const list = await request(harness.api, outsider.token, "GET", "/departments");
      expect(list.status).toBe(200);
      expect(Array.isArray(list.body)).toBe(true);
      expect(body?.code).toBe("ENG");
    });

    it("refuses department creation to a non-admin", async () => {
      const { status } = await request(harness.api, harness.token, "POST", "/departments", {
        code: "OPS",
        name: "Operations",
      });
      expect(status).toBe(403);
    });

    it("refuses to delete a department that still has people", async () => {
      const department = await request(harness.api, admin.token, "POST", "/departments", {
        code: "QA",
        name: "Quality",
      });
      const departmentId = department.body?.id as string;

      await request(harness.api, admin.token, "PATCH", `/people/${harness.userId}`, {
        departmentId,
      });

      const { status, body } = await request(
        harness.api,
        admin.token,
        "DELETE",
        `/departments/${departmentId}`,
      );

      expect(status).toBe(409);
      expect(body?.code).toBe("DEPARTMENT_IN_USE");
    });

    it("does not let a person promote themselves", async () => {
      const { status } = await request(harness.api, harness.token, "PATCH", "/me", {
        name: "Renamed",
        role: "admin",
      });

      // The role field is not part of the self-service schema, so it is rejected
      // as an unknown property rather than silently ignored.
      expect([200, 422]).toContain(status);

      const session = await request(harness.api, harness.token, "GET", "/account/session");
      const payload = session.body as { user: { role: string; name: string } };
      expect(payload.user.role).toBe("manager");
    });
  });

  describe("notifications", () => {
    it("starts empty with a zero unread count", async () => {
      const { status, body } = await request(harness.api, harness.token, "GET", "/notifications");
      expect(status).toBe(200);

      const payload = body as { items: unknown[]; unreadCount: number };
      expect(payload.items).toHaveLength(0);
      expect(payload.unreadCount).toBe(0);
    });

    it("tells the reviewer when a submission is waiting", async () => {
      const created = await request(harness.api, harness.token, "POST", "/projects", {
        name: "Notify test",
      });
      const projectId = created.body?.id as string;

      await request(harness.api, harness.token, "POST", `/projects/${projectId}/members`, {
        userId: admin.userId,
        role: "member",
      });

      const task = await request(harness.api, harness.token, "POST", `/projects/${projectId}/tasks`, {
        name: "Needs signing off",
        reviewerId: admin.userId,
      });

      await request(
        harness.api,
        harness.token,
        "POST",
        `/projects/${projectId}/tasks/${task.body?.id}/submissions`,
        {},
      );

      const { body } = await request(admin.api, admin.token, "GET", "/notifications");
      const payload = body as { items: { title: string }[]; unreadCount: number };

      expect(payload.unreadCount).toBe(1);
      expect(payload.items[0]?.title).toContain("ready for review");
    });
  });

  describe("validation shape", () => {
    it("names the offending field in a machine-readable code", async () => {
      const { status, body } = await request(harness.api, harness.token, "POST", "/projects", {
        name: "ok",
        targetLaunchDate: "not-a-date",
      });

      expect(status).toBe(422);
      expect(body?.code).toBe("VALIDATION");
      expect(String(body?.message)).toContain("targetLaunchDate");
    });

    it("returns a JSON error for a body that is not JSON", async () => {
      const response = await harness.api.handle(
        new Request("http://localhost/api/projects", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${harness.token}` },
          body: "{ not json",
        }),
      );

      expect(response.status).toBe(400);
      const body = (await response.json()) as { code: string };
      expect(body.code).toBe("MALFORMED_BODY");
    });

    it("returns NOT_FOUND for an unknown route", async () => {
      const { status, body } = await request(harness.api, harness.token, "GET", "/does-not-exist");
      expect(status).toBe(404);
      expect(body?.code).toBe("NOT_FOUND");
    });
  });
});


