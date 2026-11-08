import { Elysia, t } from "elysia";
import type { Database } from "../../db/client.ts";
import type { SessionUser } from "../../db/auth.ts";
import type { createGuards } from "../../lib/guards.ts";
import { errors } from "../../lib/errors.ts";
import { ID, okResponse } from "../../lib/validation.ts";
import { DocumentService } from "./service.ts";

type Deps = { db: Database };
type Guards = ReturnType<typeof createGuards>;

export function documentsModule(deps: Deps, guards: Guards) {
  return new Elysia({ name: "documents" })
    .use(guards)
    .get(
      "/documents",
      ({ query }) => DocumentService.list(deps.db, { kind: "all" }, query),
      {
        signedIn: true,
        query: t.Object({
          search: t.Optional(t.String({ maxLength: 200 })),
          kind: t.Optional(t.String({ maxLength: 40 })),
          limit: t.Optional(t.Integer({ minimum: 1, maximum: 200, default: 50 })),
          offset: t.Optional(t.Integer({ minimum: 0, default: 0 })),
        }),
      },
    )
    .get(
      "/projects/:projectId/documents",
      ({ projectId, query }) =>
        DocumentService.list(deps.db, { kind: "project", projectId }, query),
      {
        projectAccess: "projectId",
        params: t.Object({ projectId: ID }),
        query: t.Object({
          search: t.Optional(t.String({ maxLength: 200 })),
          kind: t.Optional(t.String({ maxLength: 40 })),
          limit: t.Optional(t.Integer({ minimum: 1, maximum: 200, default: 50 })),
          offset: t.Optional(t.Integer({ minimum: 0, default: 0 })),
        }),
      },
    )
    /**
     * Multipart, because a document without its file is a filename. The optional
     * `file` field lets someone register an external reference with a URL in
     * `note` instead of an upload.
     */
    .post(
      "/documents",
      async ({ user, body }) => {
        const upload = body as {
          file?: File;
          name?: string;
          projectId?: string;
          taskId?: string;
          kind?: string;
          note?: string;
        };

        const file = upload.file ?? null;
        const name = upload.name?.trim() || file?.name;

        if (!name) throw errors.invalid("Give the document a name or attach a file");

        return DocumentService.create(
          deps.db,
          {
            name,
            projectId: upload.projectId ?? null,
            taskId: upload.taskId ?? null,
            kind: upload.kind,
            note: upload.note ?? null,
          },
          file,
          { id: (user as SessionUser).id, role: (user as SessionUser).role },
        );
      },
      {
        signedIn: true,
        body: t.Object({
          file: t.Optional(t.File({ maxSize: "25m" })),
          name: t.Optional(t.String({ maxLength: 200 })),
          projectId: t.Optional(ID),
          taskId: t.Optional(ID),
          kind: t.Optional(t.String({ maxLength: 40 })),
          note: t.Optional(t.String({ maxLength: 1000 })),
        }),
      },
    )
    .get("/documents/:documentId/file", async ({ params, set }) => {
      const { file, name, mimeType } = await DocumentService.download(deps.db, params.documentId);
      set.headers["content-type"] = mimeType;
      set.headers["content-disposition"] = `inline; filename="${name.replaceAll('"', "")}"`;
      return file.data;
    }, {
      signedIn: true,
      params: t.Object({ documentId: ID }),
    })
    .delete(
      "/documents/:documentId",
      ({ user, params }) =>
        DocumentService.remove(deps.db, params.documentId, (user as SessionUser).id),
      {
        signedIn: true,
        params: t.Object({ documentId: ID }),
        response: { 200: okResponse },
      },
    );
}



