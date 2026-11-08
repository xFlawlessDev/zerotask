import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { countWeekdays, workloadWindow } from "@zerotask/domain";
import { createTestDatabase, truncateAll } from "../db/testing.ts";
import { createAuth } from "../db/auth.ts";
import { createApp } from "../app.ts";
import { users, workLogs } from "../db/schema/index.ts";
import type { Database } from "../db/client.ts";
/**
 * The Resources page is driven by `/workload`, and its two failure modes were both
 * invisible in the old suite: a department filter that made Postgres reject the
 * statement, and a window that pointed at the future so every number was zero.
 * These tests seed real work logs and ask the real route for them.
 */

const PASSWORD = "correct-horse-battery";

let db: Database;
let api: ReturnType<typeof createApp>;
let auth: ReturnType<typeof createAuth>;
let closeDatabase: () => Promise<void>;

async function signUp(input: { email: string; name: string; role?: "staff" | "lead" | "manager" | "admin" }) {
  const result = await auth.api.signUpEmail({
    body: { email: input.email, password: PASSWORD, name: input.name },
  });
  if (input.role && input.role !== "staff") {
    await db.update(users).set({ role: input.role }).where(eq(users.id, result.user.id));
  }
  return { token: result.token as string, userId: result.user.id };
}

async function get(token: string, path: string) {
  const response = await api.handle(
    new Request(`http://localhost/api${path}`, { headers: { authorization: `Bearer ${token}` } }),
  );
  const text = await response.text();
  return {
    status: response.status,
    body: text.length > 0 ? (JSON.parse(text) as Record<string, unknown>) : null,
  };
}

async function post(token: string, path: string, body: unknown) {
  const response = await api.handle(
    new Request(`http://localhost/api${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const text = await response.text();
  return {
    status: response.status,
    body: text.length > 0 ? (JSON.parse(text) as Record<string, unknown>) : null,
  };
}

async function patch(token: string, path: string, body: unknown) {
  const response = await api.handle(
    new Request(`http://localhost/api${path}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const text = await response.text();
  return {
    status: response.status,
    body: text.length > 0 ? (JSON.parse(text) as Record<string, unknown>) : null,
  };
}

interface WorkloadBody {
  window: { from: string; to: string; weekdays: number };
  people: { name: string; loggedHours: number; openTasks: number; utilisation: number; departmentName: string | null }[];
  departments: { name: string; loggedHours: number; headcount: number }[];
}

const iso = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

describe("workload", () => {
  let manager: { token: string; userId: string };
  let admin: { token: string; userId: string };
  let engineering: { id: string; name: string };
  let operations: { id: string; name: string };

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
    manager = await signUp({ email: "workload-manager@example.com", name: "Workload Manager", role: "manager" });
    admin = await signUp({ email: "workload-admin@example.com", name: "Workload Admin", role: "admin" });

    const created = await post(admin.token, "/departments", { code: "ENG", name: "Engineering" });
    expect(created.status).toBe(200);
    engineering = { id: created.body?.id as string, name: "Engineering" };
    const other = await post(admin.token, "/departments", { code: "OPS", name: "Operations" });
    expect(other.status).toBe(200);
    operations = { id: other.body?.id as string, name: "Operations" };
  });

  /** Two people in two departments, each with a real work log in the past. */
  async function seedWork() {
    const engineer = await signUp({ email: "engineer@example.com", name: "Engineer Person" });
    const operator = await signUp({ email: "operator@example.com", name: "Operator Person" });

    // Only an admin may move someone between departments, which is the same rule
    // the people screen obeys.
    expect((await patch(admin.token, `/people/${engineer.userId}`, { departmentId: engineering.id })).status).toBe(200);
    expect((await patch(admin.token, `/people/${operator.userId}`, { departmentId: operations.id })).status).toBe(200);

    const project = await post(manager.token, "/projects", { name: "Workload project" });
    const projectId = project.body?.id as string;

    const task = await post(manager.token, `/projects/${projectId}/tasks`, { name: "Logged work" });
    const taskId = task.body?.id as string;

    await db.insert(workLogs).values([
      { taskId, userId: engineer.userId, logDate: iso(-3), hours: "6", note: "Engineering day" },
      { taskId, userId: engineer.userId, logDate: iso(-2), hours: "2", note: "Engineering follow-up" },
      { taskId, userId: operator.userId, logDate: iso(-1), hours: "4", note: "Operations day" },
    ]);

    return { projectId, taskId, engineer, operator };
  }

  it("reports the hours people actually logged, in a window that looks back from today", async () => {
    const { engineer, operator } = await seedWork();
    const { from, to } = workloadWindow(14, iso(0));

    const { status, body } = await get(manager.token, `/workload?from=${from}&to=${to}`);
    expect(status).toBe(200);

    const workload = body as unknown as WorkloadBody;
    const byName = new Map(workload.people.map((person) => [person.name, person]));

    expect(workload.window).toEqual({ from, to, weekdays: countWeekdays(from, to) });
    expect(byName.get("Engineer Person")?.loggedHours).toBe(8);
    expect(byName.get("Operator Person")?.loggedHours).toBe(4);
    expect(byName.get("Engineer Person")?.departmentName).toBe("Engineering");

    // A 14-day window ending today contains the logs, so the page has rows to show
    // instead of "No logged work in this window".
    expect(workload.people.some((person) => person.loggedHours > 0)).toBe(true);
    expect(workload.people.every((person) => person.utilisation >= 0)).toBe(true);
    expect(workload.people.every((person) => Number.isFinite(person.loggedHours))).toBe(true);
    expect(engineer.userId).toBeTruthy();
    expect(operator.userId).toBeTruthy();
  });

  it("filters by department without failing, returning only that department's people", async () => {
    await seedWork();
    const { from, to } = workloadWindow(14, iso(0));

    const { status, body } = await get(
      manager.token,
      `/workload?from=${from}&to=${to}&departmentId=${engineering.id}`,
    );

    expect(status).toBe(200);
    const workload = body as unknown as WorkloadBody;
    expect(workload.people.map((person) => person.name)).toEqual(["Engineer Person"]);
    expect(workload.people[0]?.departmentName).toBe("Engineering");
    expect(workload.people[0]?.loggedHours).toBe(8);
  });

  it("returns zero hours for a window that genuinely contains no work", async () => {
    await seedWork();
    const { from, to } = workloadWindow(3, iso(-90));

    const { status, body } = await get(manager.token, `/workload?from=${from}&to=${to}`);
    expect(status).toBe(200);

    const workload = body as unknown as WorkloadBody;
    expect(workload.people.every((person) => person.loggedHours === 0)).toBe(true);
  });

  it("keeps department totals consistent with the people it lists", async () => {
    await seedWork();
    const { from, to } = workloadWindow(14, iso(0));

    const { body } = await get(manager.token, `/workload?from=${from}&to=${to}`);
    const workload = body as unknown as WorkloadBody;

    const engineeringRow = workload.departments.find((row) => row.name === "Engineering");
    expect(engineeringRow?.loggedHours).toBe(8);
    expect(engineeringRow?.headcount).toBe(1);
  });
});

describe("workloadWindow", () => {
  it("ends today and spans the number of days requested", () => {
    expect(workloadWindow(14, "2026-11-07")).toEqual({ from: "2026-10-25", to: "2026-11-07" });
    expect(workloadWindow(7, "2026-11-07")).toEqual({ from: "2026-11-01", to: "2026-11-07" });
    expect(workloadWindow(1, "2026-11-07")).toEqual({ from: "2026-11-07", to: "2026-11-07" });
  });

  it("crosses a month and a leap day without drifting", () => {
    expect(workloadWindow(2, "2028-03-01")).toEqual({ from: "2028-02-29", to: "2028-03-01" });
    expect(workloadWindow(31, "2026-01-15")).toEqual({ from: "2025-12-16", to: "2026-01-15" });
  });

  it("counts weekdays as capacity, ignoring Saturday and Sunday", () => {
    // 2 Nov 2026 is a Monday; the 8th is a Sunday.
    expect(countWeekdays("2026-11-02", "2026-11-08")).toBe(5);
    expect(countWeekdays("2026-11-07", "2026-11-07")).toBe(0);
    expect(countWeekdays("2026-11-02", "2026-11-02")).toBe(1);
    expect(countWeekdays("2026-11-08", "2026-11-02")).toBe(0);
  });
});
