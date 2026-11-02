import { Elysia } from "elysia";
import type { Database } from "../../db/client.ts";
import type { SessionUser } from "../../db/auth.ts";
import type { createGuards } from "../../lib/guards.ts";
import { DepartmentModel, UserModel } from "./model.ts";
import { PeopleService } from "./service.ts";
import { idParams, okResponse } from "../../lib/validation.ts";

type Deps = { db: Database };
type Guards = ReturnType<typeof createGuards>;

/**
 * `GET /me` returns the app view of the signed-in person, which is not the same
 * thing as the session: Better Auth's session carries credentials metadata, and
 * the UI only ever needs this shape.
 */
function profileRoutes(deps: Deps, guards: Guards) {
  return new Elysia({ prefix: "/me" })
    .use(guards)
    .get("/", ({ user }) => PeopleService.byId(deps.db, (user as SessionUser).id), { signedIn: true })
    .patch(
      "/",
      ({ user, body }) => PeopleService.updateSelf(deps.db, (user as SessionUser).id, body),
      { signedIn: true, body: UserModel.updateSelf },
    );
}

function directoryRoutes(deps: Deps, guards: Guards) {
  return new Elysia({ prefix: "/people" })
    .use(guards)
    /**
     * The static segment is declared before `/:id`. Elysia matches in
     * declaration order, so the reverse order would swallow `/people/lookup`.
     */
    .get("/lookup", ({ query }) => PeopleService.lookup(deps.db, query), {
      signedIn: true,
      query: UserModel.lookupQuery,
    })
    .get("/", ({ query }) => PeopleService.list(deps.db, query), {
      signedIn: true,
      query: UserModel.listQuery,
    })
    .get("/:id", ({ params }) => PeopleService.byId(deps.db, params.id), {
      signedIn: true,
      params: idParams,
    })
    .patch("/:id", ({ params, body }) => PeopleService.updateByAdmin(deps.db, params.id, body), {
      admin: true,
      params: idParams,
      body: UserModel.updateByAdmin,
    })
    .delete(
      "/:id",
      ({ params, user }) => PeopleService.remove(deps.db, params.id, (user as SessionUser).id),
      { admin: true, params: idParams, response: { 200: okResponse } },
    );
}

function departmentRoutes(deps: Deps, guards: Guards) {
  return new Elysia({ prefix: "/departments" })
    .use(guards)
    .get("/", () => PeopleService.listDepartments(deps.db), { signedIn: true })
    .post("/", ({ body }) => PeopleService.createDepartment(deps.db, body), {
      admin: true,
      body: DepartmentModel.create,
    })
    .patch("/:id", ({ params, body }) => PeopleService.updateDepartment(deps.db, params.id, body), {
      admin: true,
      params: idParams,
      body: DepartmentModel.update,
    })
    .delete("/:id", ({ params }) => PeopleService.removeDepartment(deps.db, params.id), {
      admin: true,
      params: idParams,
      response: { 200: okResponse },
    });
}

export function peopleModule(deps: Deps, guards: Guards) {
  return new Elysia({ name: "people" })
    .use(profileRoutes(deps, guards))
    .use(directoryRoutes(deps, guards))
    .use(departmentRoutes(deps, guards));
}
