import { useState } from "react";
import { useRequiredSession } from "@/features/session";
import { usePeople, useDepartments, usePersonActions, useDepartmentActions, useTemplates } from "@/features/hooks";
import { Button, IconButton } from "@/components/ui/button";
import { PasswordField, SelectField, TextField } from "@/components/ui/field";
import { EmptyState, ErrorState, Figure, LoadingState, PageHeader } from "@/components/ui/surface";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IconPlus, IconTrash } from "@/components/icon";
import { initials } from "@/lib/format";
import { ROLES, ROLE_LABEL } from "@zerotask/domain";
import type { Role } from "@zerotask/domain";

/**
 * Admin: people, departments, and templates in one place.
 *
 * This page is only reachable for admins, so everything on it can act directly
 * without a second confirmation layer. Deleting a person or a department explains
 * in the confirm dialog what happens to the work that points at it.
 */
export default function AdminPage() {
  const { person, capabilities } = useRequiredSession();
  const { create: createPerson, update: updatePerson, remove: removePerson } = usePersonActions();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { create: createDepartment, remove: removeDepartment } = useDepartmentActions();

  const { data: peopleData, isLoading, error, refetch } = usePeople({ search, page });
  const { data: departments } = useDepartments();
  const { data: templates } = useTemplates();

  if (!capabilities.managePeople) {
    return (
      <PageHeader
        title="Admin"
        description="This area is for admins."
        meta={
          <span className="text-meta text-ink-muted">
            Your role applies to the whole workspace, so it is not something to edit yourself.
          </span>
        }
      />
    );
  }

  const people = peopleData?.items ?? [];

  return (
    <>
      <PageHeader
        title="Admin"
        description={`Signed in as ${person.name ?? person.email}, with the admin role.`}
        meta={
          <>
            <Figure value={peopleData?.total ?? 0} label="people" />
            <Figure value={departments?.length ?? 0} label="departments" />
            <Figure value={templates?.length ?? 0} label="templates" />
          </>
        }
      />

      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <section aria-label="People and roles">
          <h2 className="mb-3 text-section font-semibold text-ink">Roles</h2>
          <p className="mb-3 max-w-prose text-meta text-ink-muted">
            A role applies to the whole workspace: staff do their tasks, leads run reviews, managers
            run projects, admin changes the workspace itself.
          </p>

          <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><TextField label="Search people" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /><Button variant="primary" onClick={() => setCreateOpen(true)}>Add user</Button></div>
          {error ? <ErrorState description="People could not be loaded." action={<Button onClick={() => void refetch()}>Try again</Button>} /> : isLoading ? (
            <LoadingState label="Loading people" />
          ) : (
            <div className="overflow-hidden rounded-panel border border-rule bg-surface">
              <ul className="divide-y divide-rule">
                {people.map((row) => (
                  <li key={row.id} className="flex h-(--row-height) items-center gap-3 px-3">
                    <span
                      aria-hidden="true"
                      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-ink text-[11px] font-semibold text-on-accent"
                    >
                      {initials(row.name ?? row.email)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-compact text-ink">
                      {row.name ?? "Unnamed"}
                      <span className="ml-2 text-meta text-ink-muted">{row.email}</span>
                    </span>
                    <span className="hidden text-meta text-ink-muted sm:block">
                      {row.departmentName ?? "No department"}
                    </span>
                    <select
                      aria-label={`Role of ${row.name ?? row.email}`}
                      value={row.role}
                      disabled={row.id === person.id || updatePerson.isPending}
                      onChange={(event) =>
                        updatePerson.mutate({ id: row.id, body: { role: event.target.value as Role } })
                      }
                      className="h-7 rounded-control border border-input bg-surface px-2 text-meta"
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABEL[role]}
                        </option>
                      ))}
                    </select>
                    <select aria-label={`Department of ${row.name ?? row.email}`} value={row.departmentId ?? ""} disabled={updatePerson.isPending} onChange={(event) => updatePerson.mutate({ id: row.id, body: { departmentId: event.target.value || null } })} className="h-7 max-w-32 rounded-control border border-input bg-surface px-2 text-meta"><option value="">No department</option>{departments?.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select>
                    <IconButton
                      label={`Remove ${row.name ?? row.email}`}
                      variant="danger"
                      disabled={row.id === person.id || removePerson.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Remove ${row.name ?? row.email} from the workspace? They lose access immediately; their completed work keeps their name on it.`,
                          )
                        ) {
                          removePerson.mutate(row.id);
                        }
                      }}
                    >
                      <IconTrash size={14} />
                    </IconButton>
                  </li>
                ))}
              </ul>
              {(peopleData?.total ?? 0) > 50 && <div className="flex items-center justify-between border-t border-rule p-3 text-meta text-ink-muted"><span>Page {page}</span><div className="flex gap-2"><Button size="sm" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><Button size="sm" disabled={page * 50 >= (peopleData?.total ?? 0)} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div>}
            </div>
          )}
        </section>

        <section aria-label="Departments">
          <h2 className="mb-3 text-section font-semibold text-ink">Departments</h2>
          <DepartmentsPanel
            departments={departments ?? []}
            onCreate={createDepartment.mutateAsync}
            onRemove={(id, name) => {
              if (window.confirm(`Remove the ${name} department? People in it keep their accounts but lose the department.`)) {
                removeDepartment.mutate(id);
              }
            }}
          />
        </section>
      </div>
      <Dialog open={createOpen} onOpenChange={(open) => { if (!createPerson.isPending) setCreateOpen(open); }}><DialogContent><DialogHeader><DialogTitle>Add user</DialogTitle><DialogDescription>Create a staff account. You can change its role and department after creation.</DialogDescription></DialogHeader>
        <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); createPerson.mutate({ name: name.trim(), email: email.trim(), password }, { onSuccess: () => { setCreateOpen(false); setName(""); setEmail(""); setPassword(""); setSearch(""); setPage(1); } }); }}>
          <TextField label="Name" required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
          <TextField label="Email" type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
          <PasswordField label="Initial password" required minLength={10} maxLength={128} autoComplete="new-password" hint="At least 10 characters." value={password} onChange={(event) => setPassword(event.target.value)} />
          <DialogFooter><Button onClick={() => setCreateOpen(false)} disabled={createPerson.isPending}>Cancel</Button><Button type="submit" variant="primary" disabled={createPerson.isPending}>{createPerson.isPending ? "Creating…" : "Create user"}</Button></DialogFooter>
        </form></DialogContent></Dialog>
    </>
  );
}

function DepartmentsPanel({
  departments,
  onCreate,
  onRemove,
}: {
  departments: { id: string; code: string; name: string; color: string; headcount?: number; openTasks?: number }[];
  onCreate: (input: { code: string; name: string }) => Promise<unknown>;
  onRemove: (id: string, name: string) => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-panel border border-rule bg-surface">
      <ul className="divide-y divide-rule">
        {departments.map((department) => (
          <li key={department.id} className="flex h-(--row-height) items-center gap-3 px-3">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: department.color }}
            />
            <span className="min-w-0 flex-1 truncate text-compact text-ink">
              {department.name}
              <span className="ml-2 font-mono text-meta text-ink-muted">{department.code}</span>
            </span>
            <span className="tnum hidden text-meta text-ink-muted sm:block">
              {department.headcount ?? 0} people · {department.openTasks ?? 0} open tasks
            </span>
            <IconButton
              label={`Remove ${department.name}`}
              variant="danger"
              onClick={() => onRemove(department.id, department.name)}
            >
              <IconTrash size={14} />
            </IconButton>
          </li>
        ))}

        <li className="flex flex-wrap items-end gap-2 bg-sunk px-3 py-2">
          <TextField
            label="Code"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            className="w-24"
            maxLength={8}
            error={error}
          />
          <TextField
            label="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="min-w-40 flex-1"
          />
          <Button
            variant="primary"
            size="sm"
            leading={<IconPlus />}
            disabled={code.length < 2 || name.trim().length < 2}
            onClick={() => {
              onCreate({ code: code.trim(), name: name.trim() })
                .then(() => {
                  setCode("");
                  setName("");
                  setError(null);
                })
                .catch(() => setError("That code may already be in use."));
            }}
          >
            Add
          </Button>
        </li>
      </ul>
    </div>
  );
}

export { SelectField, TextField, EmptyState };
