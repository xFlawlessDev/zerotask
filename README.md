# Zero Task

Project-delivery workspace: plan work as a dependency graph, run critical-path
scheduling over it, and gate completion behind review.

A revamp of `zerotask-monorepo`, rebuilt from scratch around one embedded
database, one typed API, and one design direction. See `DESIGN.md` for the visual
language and the reasoning behind it.

## Stack

| Layer    | Choice                                                              |
| -------- | ------------------------------------------------------------------- |
| Runtime  | Bun                                                                  |
| API      | Elysia + Drizzle ORM + Better Auth                                   |
| Database | PostgreSQL, or embedded PGlite when no `DATABASE_URL` is set         |
| Frontend | React 19 + Vite + TanStack Router/Query + Tailwind v4 + shadcn/ui    |
| Domain   | `@zerotask/domain`, shared by both apps: statuses, roles, RBAC rules |

## Run it

```bash
bun install

# both servers at once: the API on :3400, the web app on :5183
bun run dev
```

The web app proxies `/api` to the API, so the browser only ever talks to one
origin. To run them separately, use `bun run dev:api` and `bun run dev:web`.

Open http://localhost:5183 and sign in with a seeded account:

| Account                | Role    | What you will see                                 |
| ---------------------- | ------- | ------------------------------------------------- |
| `admin@zerotask.dev`   | admin   | Everything, plus the admin pages                  |
| `iman@zerotask.dev`    | manager | Owns ZR-001 and ZR-003, has a review waiting      |
| `sari@zerotask.dev`    | lead    | Reviewer on the ZR-001 adapter, owns ZR-002 (late) |
| `budi@zerotask.dev`    | staff   | Assignee on "Build the receiving adapter"         |

Password for all seeded accounts: `zerotask-demo-2026`.

## Commands

```bash
bun run typecheck        # all packages, including the E2E suite
bun run test             # API tests: 16 unit + 36 integration, real SQL
bun run build            # production web build
bun run e2e              # end-to-end tests in Chromium (see below)
bun run e2e:ui           # the same suite in Playwright's interactive runner

bun run --cwd apps/api db:generate   # generate a migration from the schema
bun run --cwd apps/api db:migrate    # apply migrations
bun run --cwd apps/api db:seed       # seed the demo workspace
bun run --cwd apps/api db:reset      # wipe the embedded database
```

### End-to-end tests

`bun run e2e` starts its own API on `:3410` and web app on `:5193`, each with a
fresh embedded database seeded from the demo workspace. The dev servers can keep
running alongside it. The suite runs one worker, because the tests share that
database. Reports and traces land in `playwright-report/` and `test-results/` when
a test fails.

Some tests change data, and the review workflow settles a seeded submission, so
the suite is ordered on purpose: read-only areas run first and the review flow
runs last. The first Playwright run needs the browser once:
`bunx playwright install chromium`.

If a run is interrupted on Windows, stop the leftover processes with
`taskkill /IM bun.exe /F` and `taskkill /IM node.exe /F`, since stopping only the
parent process leaves its children holding the ports.

The contrast audit checks every colour pairing against WCAG AA and fails on a
regression:

```bash
bun run scripts/contrast.ts
```

## What is in the box

- **Scheduling.** A working-day CPM engine (`apps/api/src/domain/scheduler.ts`),
  pure and unit-tested: FS/SS/FF/SF links with lag, pinned dates, forecast basis
  from actual progress, cycle detection, float and delay per task.
- **Review workflow.** Completion is a state machine, not a checkbox: submit →
  reviewers frozen at submit time → decisions recorded as rows → approve completes
  and reschedules, reject returns the task to work. Self-review and double
  decisions are refused.
- **RBAC.** App roles (staff/lead/manager/admin) and project roles
  (viewer/member/manager/owner) are separate concerns, enforced by one guard
  module. Admins are never locked out of a project but are not implicit members.
- **Typed API.** One client module, one hook per interaction. Query keys mirror
  URLs; writes invalidate; errors surface as toasts in one place.

## Notes

- With no `DATABASE_URL`, the API runs PGlite (real Postgres in-process) persisted
  under `apps/api/.data`. Point `DATABASE_URL` at a server for anything shared.
- Email is queued in an outbox table and drained by a worker. No provider is
  configured by default; wire one in `apps/api/src/lib/email-worker.ts`.
- Files are stored on the local filesystem under `apps/api/.data/uploads`.
