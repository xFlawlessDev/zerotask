import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { config } from "../config.ts";
import { users } from "../db/schema/index.ts";
import type { Database } from "../db/client.ts";
import { createTestDatabase, truncateAll } from "../db/testing.ts";
import { createAuth } from "../db/auth.ts";
import { createApp } from "../app.ts";

/**
 * Documents are the one module that touches the filesystem, so these tests drive
 * the real multipart route and then look at the real file it wrote. The storage
 * root is read from the same `config` the app reads, rather than a test-only
 * override: Bun shares one module registry across test files, so a config frozen
 * by another file would silently point the assertion at a different directory
 * than the code under test.
 */

const PASSWORD = "correct-horse-battery";
const uploadRoot = resolve(process.cwd(), config.uploadDir);

let db: Database;
let api: ReturnType<typeof createApp>;
let auth: ReturnType<typeof createAuth>;
let closeDatabase: () => Promise<void>;

interface Harness {
  token: string;
  userId: string;
}

async function signUp(person: { email: string; name: string; role?: "staff" | "lead" | "manager" | "admin" }): Promise<Harness> {
  const result = await auth.api.signUpEmail({
    body: { email: person.email, password: PASSWORD, name: person.name },
  });

  if (person.role && person.role !== "staff") {
    await db.update(users).set({ role: person.role }).where(eq(users.id, result.user.id));
  }

  return { token: result.token as string, userId: result.user.id };
}

async function json(token: string, method: string, path: string, body?: unknown) {
  const response = await api.handle(
    new Request(`http://localhost/api${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        authorization: `Bearer ${token}`,
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

/** Posts a real multipart body, which is what the browser's upload form sends. */
async function upload(
  token: string,
  input: { file?: { name: string; type: string; bytes: Uint8Array }; fields?: Record<string, string> },
) {
  const form = new FormData();
  if (input.file) {
    form.append("file", new File([input.file.bytes], input.file.name, { type: input.file.type }));
  }
  for (const [key, value] of Object.entries(input.fields ?? {})) form.append(key, value);

  const response = await api.handle(
    new Request("http://localhost/api/documents", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: form,
    }),
  );

  const text = await response.text();
  return {
    status: response.status,
    body: text.length > 0 ? (JSON.parse(text) as Record<string, unknown>) : null,
  };
}

describe("documents", () => {
  let owner: Harness;
  let stranger: Harness;
  let admin: Harness;
  /** Directories this suite created, removed afterwards so tests leave no files. */
  const written = new Set<string>();

  beforeAll(async () => {
    const database = await createTestDatabase();
    db = database.db;
    closeDatabase = database.client.close.bind(database.client);
    auth = createAuth(db);
    api = createApp({ db, auth });
  });

  afterAll(async () => {
    await closeDatabase();
    for (const directory of written) await rm(join(uploadRoot, directory), { recursive: true, force: true });
  });

  beforeEach(async () => {
    await truncateAll(db);
    owner = await signUp({ email: "doc-owner@example.com", name: "Doc Owner", role: "manager" });
    stranger = await signUp({ email: "doc-stranger@example.com", name: "Stranger" });
    admin = await signUp({ email: "doc-admin@example.com", name: "Doc Admin", role: "admin" });
  });

  it("stores an uploaded file and serves its bytes back", async () => {
    const bytes = new TextEncoder().encode("signed field mapping v1.2");
    const created = await upload(owner.token, {
      file: { name: "WMS field mapping, signed.pdf", type: "application/pdf", bytes },
      fields: { name: "WMS field mapping, signed", kind: "spec" },
    });

    expect(created.status).toBe(200);
    const document = created.body as {
      id: string;
      code: string;
      name: string;
      storageKey: string | null;
      sizeBytes: number;
      mimeType: string;
    };

    expect(document.name).toBe("WMS field mapping, signed");
    expect(document.code).toMatch(/^DOC-\d{3}$/);
    expect(document.storageKey).toBeTruthy();
    expect(document.sizeBytes).toBe(bytes.byteLength);
    expect(document.mimeType).toBe("application/pdf");

    // The key must survive the characters a real file name contains: spaces and
    // a comma in "WMS field mapping, signed.pdf". A sanitiser that throws on the
    // first upload is exactly the failure this asserts against.
    const keyParts = document.storageKey!.split("/");
    expect(keyParts).toHaveLength(2);
    expect(keyParts[1]).not.toMatch(/[^\w.\-]/u);
    written.add(keyParts[0]!);

    const onDisk = await readdir(join(uploadRoot, keyParts[0]!));
    expect(onDisk).toEqual([keyParts[1]!]);

    const download = await api.handle(
      new Request(`http://localhost/api/documents/${document.id}/file`, {
        headers: { authorization: `Bearer ${owner.token}` },
      }),
    );

    expect(download.status).toBe(200);
    expect(download.headers.get("content-type")).toBe("application/pdf");
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(bytes);
  });

  it("registers a name-only reference without touching the filesystem", async () => {
    const before = await readdir(uploadRoot).catch(() => [] as string[]);

    const created = await upload(owner.token, {
      fields: { name: "Vendor SLA (external link)", kind: "other", note: "https://example.com/sla" },
    });

    expect(created.status).toBe(200);
    const document = created.body as { storageKey: string | null; sizeBytes: number | null };
    expect(document.storageKey).toBeNull();
    expect(document.sizeBytes).toBeNull();

    const after = await readdir(uploadRoot).catch(() => [] as string[]);
    expect(after).toEqual(before);
  });

  it("links a document to a project and a task, and names the project in both lists", async () => {
    const project = await json(owner.token, "POST", "/projects", { name: "Docs linked project" });
    const projectId = project.body?.id as string;
    const task = await json(owner.token, "POST", `/projects/${projectId}/tasks`, { name: "Collect evidence" });
    const taskId = task.body?.id as string;

    const created = await upload(owner.token, {
      file: { name: "evidence.txt", type: "text/plain", bytes: new TextEncoder().encode("evidence") },
      fields: { name: "Evidence pack", projectId, taskId },
    });

    expect(created.status).toBe(200);
    const document = created.body as { projectId: string; taskId: string };
    expect(document.projectId).toBe(projectId);
    expect(document.taskId).toBe(taskId);

    const global = await json(owner.token, "GET", "/documents");
    const globalRow = (global.body as { items: { projectName: string | null; taskCode: string | null }[] }).items[0]!;
    expect(globalRow.projectName).toBe("Docs linked project");
    expect(globalRow.taskCode).toMatch(new RegExp(`^${project.body?.code}-`));

    const scoped = await json(owner.token, "GET", `/projects/${projectId}/documents`);
    const scopedItems = (scoped.body as { items: { name: string }[] }).items;
    expect(scopedItems.map((item) => item.name)).toEqual(["Evidence pack"]);
  });

  it("refuses to attach a document to a project the uploader cannot open", async () => {
    const project = await json(owner.token, "POST", "/projects", { name: "Private project" });
    const projectId = project.body?.id as string;

    const created = await upload(stranger.token, {
      fields: { name: "Should not attach", projectId },
    });

    expect(created.status).toBe(403);
  });

  it("lets only the uploader or an admin delete a document", async () => {
    const created = await upload(owner.token, { fields: { name: "Owner document" } });
    const documentId = created.body?.id as string;

    const refused = await json(stranger.token, "DELETE", `/documents/${documentId}`);
    expect(refused.status).toBe(403);

    const allowed = await json(owner.token, "DELETE", `/documents/${documentId}`);
    expect(allowed.status).toBe(200);

    const list = await json(owner.token, "GET", "/documents");
    expect((list.body as { items: unknown[] }).items).toHaveLength(0);
  });

  it("rejects a file type it will not store", async () => {
    const { status, body } = await upload(owner.token, {
      file: { name: "payload.exe", type: "application/x-msdownload", bytes: new Uint8Array([1, 2, 3]) },
    });

    expect(status).toBe(422);
    expect(String(body?.message)).toContain("not accepted");
  });

  /**
   * An admin may open any project, so the picker offers every project; the create
   * route has to agree. It used to check membership by hand and answer "you are not
   * a member" for a project the same admin had just been shown.
   */
  it("lets an admin attach a document to a project they are not a member of", async () => {
    const project = await json(owner.token, "POST", "/projects", { name: "Someone else's project" });
    const projectId = project.body?.id as string;

    // The outsider is a plain member of this project; the admin is not in it at all.
    await json(owner.token, "POST", `/projects/${projectId}/members`, {
      userId: stranger.userId,
      role: "member",
    });

    const adminView = await json(admin.token, "GET", `/projects/${projectId}`);
    expect(adminView.status).toBe(200);

    const created = await upload(admin.token, {
      fields: { name: "Admin attached evidence", projectId },
    });

    expect(created.status).toBe(200);
    expect((created.body as { projectId: string }).projectId).toBe(projectId);

    const scoped = await json(owner.token, "GET", `/projects/${projectId}/documents`);
    expect((scoped.body as { items: { name: string }[] }).items.map((item) => item.name)).toEqual([
      "Admin attached evidence",
    ]);
  });

  it("still refuses a plain non-member", async () => {
    const project = await json(owner.token, "POST", "/projects", { name: "Closed project" });
    const projectId = project.body?.id as string;

    const refused = await upload(stranger.token, { fields: { name: "Not allowed", projectId } });
    expect(refused.status).toBe(403);
  });

  it("refuses a task that belongs to a different project than the one named", async () => {
    const first = await json(owner.token, "POST", "/projects", { name: "First project" });
    const second = await json(owner.token, "POST", "/projects", { name: "Second project" });
    const foreignTask = await json(owner.token, "POST", `/projects/${second.body?.id}/tasks`, {
      name: "Foreign task",
    });

    const refused = await upload(owner.token, {
      fields: {
        name: "Mismatched task",
        projectId: first.body?.id as string,
        taskId: foreignTask.body?.id as string,
      },
    });

    expect(refused.status).toBe(422);
    expect(String(refused.body?.message)).toContain("different project");
  });
});

