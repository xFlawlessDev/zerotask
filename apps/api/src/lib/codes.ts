import { sql } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { projects, tasks } from "../db/schema/index.ts";

/**
 * Human-facing references (`ZR-12`, `ZR-12-04`) are generated from a per-project
 * counter rather than from the row count, so a deleted task never lets two tasks
 * share a code.
 */
export async function nextProjectCode(db: Database): Promise<string> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(projects);

  const sequence = (row?.count ?? 0) + 1;
  return `ZR-${String(sequence).padStart(3, "0")}`;
}

export async function nextTaskCode(db: Database, projectId: string): Promise<string> {
  const [project] = await db
    .select({ code: projects.code })
    .from(projects)
    .where(sql`${projects.id} = ${projectId}`);

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tasks)
    .where(sql`${tasks.projectId} = ${projectId}`);

  const sequence = (row?.count ?? 0) + 1;
  return `${project?.code ?? "ZR"}-${String(sequence).padStart(2, "0")}`;
}
