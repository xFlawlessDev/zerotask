import { useState } from "react";
import { usePeople, useDepartments, usePersonActions, useDepartmentActions } from "@/features/hooks";
import { useRequiredSession } from "@/features/session";
import { Button, IconButton } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/surface";
import { ConfirmDialog } from "@/components/ui/confirm";
import { IconPlus, IconSearch, IconTrash } from "@/components/icon";
import { initials } from "@/lib/format";
import { countLabel, ROLES, ROLE_LABEL } from "@zerotask/domain";
import type { Role } from "@zerotask/domain";

/**
 * The team directory.
 *
 * Two tables on one page, because they answer one question: who is in this
 * workspace and how are they organised. Roles are edited inline by an admin;
 * removing someone is a soft delete, so their name stays on the work they did.
 */
export default function TeamPage() {
  const { capabilities } = useRequiredSession();
  const { update, remove } = usePersonActions();
  const { create: createDepartment, remove: removeDepartment } = useDepartmentActions();

  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [removingPerson, setRemovingPerson] = useState<{ id: string; label: string } | null>(null);
  const [removingDepartment, setRemovingDepartment] = useState<{ id: string; label: string } | null>(null);

  const { data, isLoading, error, refetch } = usePeople({ search });
  const { data: departments, error: departmentsError, refetch: refetchDepartments } = useDepartments();

  const isAdmin = capabilities.managePeople;

  const people = (data?.items ?? []).filter(
    (person) => departmentFilter === "all" || person.departmentId === departmentFilter,
  );

  return (
    <>
      <PageHeader
        title="Team"
        description="Everyone in this workspace, their role, and the department they sit in."
      />

      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <section aria-label="People">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h2 className="text-section font-semibold text-ink">People</h2>
            <span className="text-meta text-ink-muted">{people.length}</span>

            <div className="relative ml-auto">
              <IconSearch className="pointer-events-none absolute top-2 left-2 text-faint" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, email, or title"
                aria-label="Search people"
                className="h-8 w-64 rounded-control border border-input bg-surface pr-2 pl-7 text-compact outline-none placeholder:text-faint focus-visible:border-ring"
              />
            </div>

            <div className="w-44">
              <SelectField
                label="Department"
                value={departmentFilter}
                onChange={(event) => setDepartmentFilter(event.target.value)}
              >
                <option value="all">All departments</option>
                {(departments ?? []).map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </SelectField>
            </div>
          </div>

          {error ? (
            <ErrorState
              description="The people directory could not be loaded."
              action={<Button onClick={() => void refetch()}>Try again</Button>}
            />
          ) : isLoading ? (
            <LoadingState label="Loading people" />
          ) : people.length === 0 ? (
            <div className="rounded-panel border border-rule bg-surface">
              <EmptyState
                title="Nobody matches"
                description="Adjust the search or the department filter."
              />
            </div>
          ) : (
            <div className="overflow-hidden rounded-panel border border-rule bg-surface">
              <ul className="divide-y divide-rule">
                {people.map((person) => (
                  <li key={person.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 sm:h-(--row-height) sm:py-0">
                    <span
                      aria-hidden="true"
                      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-ink text-[11px] font-semibold text-on-accent"
                    >
                      {initials(person.name ?? person.email)}
                    </span>

                    <span className="min-w-0 flex-1 basis-40">
                      <span className="block truncate text-compact font-medium text-ink">
                        {person.name ?? "Unnamed"}
                      </span>
                      <span className="block truncate text-meta text-ink-muted">{person.email}</span>
                    </span>

                    {isAdmin ? (
                      <select
                        aria-label={`Role of ${person.name ?? person.email}`}
                        value={person.role}
                        onChange={(event) =>
                          update.mutate({ id: person.id, body: { role: event.target.value as Role } })
                        }
                        className="h-7 rounded-control border border-input bg-surface px-2 text-meta"
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABEL[role]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-meta text-ink-muted">{ROLE_LABEL[person.role]}</span>
                    )}

                    <span className="hidden text-meta text-ink-muted sm:block">
                      {person.departmentName ?? "No department"}
                    </span>

                    {isAdmin && (
                      <IconButton
                        label={`Remove ${person.name ?? person.email} from the workspace`}
                        variant="danger"
                        onClick={() => setRemovingPerson({ id: person.id, label: person.name ?? person.email })}
                      >
                        <IconTrash size={14} />
                      </IconButton>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section aria-label="Departments">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-section font-semibold text-ink">Departments</h2>
          </div>

          {departmentsError ? (
            <ErrorState
              description="The departments could not be loaded."
              action={<Button onClick={() => void refetchDepartments()}>Try again</Button>}
            />
          ) : departments === undefined ? (
            <LoadingState label="Loading departments" />
          ) : (
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
                      {countLabel(department.headcount ?? 0, "person", "people")}
                    </span>
                    <span className="tnum hidden text-meta text-ink-muted md:block">
                      {countLabel(department.openTasks ?? 0, "open task")}
                    </span>
                    {isAdmin && (
                      <IconButton
                        label={`Remove ${department.name}`}
                        variant="danger"
                        onClick={() => setRemovingDepartment({ id: department.id, label: department.name })}
                      >
                        <IconTrash size={14} />
                      </IconButton>
                    )}
                  </li>
                ))}

                {isAdmin && <NewDepartmentRow onCreate={createDepartment.mutateAsync} />}
              </ul>
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={removingPerson !== null}
        onOpenChange={(open) => !open && setRemovingPerson(null)}
        title="Remove this person?"
        description={
          removingPerson
            ? `${removingPerson.label} loses access immediately. Their name stays on the work they already did, so the history stays readable.`
            : ""
        }
        confirmLabel="Remove from workspace"
        pending={remove.isPending}
        onConfirm={() => {
          if (removingPerson) remove.mutate(removingPerson.id);
          setRemovingPerson(null);
        }}
      />

      <ConfirmDialog
        open={removingDepartment !== null}
        onOpenChange={(open) => !open && setRemovingDepartment(null)}
        title="Remove this department?"
        description={
          removingDepartment
            ? `${removingDepartment.label} stops appearing in pickers. Departments that still have people cannot be removed: move them first.`
            : ""
        }
        confirmLabel="Remove department"
        pending={removeDepartment.isPending}
        onConfirm={() => {
          if (removingDepartment) removeDepartment.mutate(removingDepartment.id);
          setRemovingDepartment(null);
        }}
      />
    </>
  );
}

function NewDepartmentRow({ onCreate }: { onCreate: (input: { code: string; name: string }) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <li className="px-3 py-2">
        <Button variant="quiet" size="sm" onClick={() => setOpen(true)} leading={<IconPlus />}>
          Add department
        </Button>
      </li>
    );
  }

  return (
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
        disabled={code.length < 2 || name.trim().length < 2}
        onClick={() => {
          onCreate({ code: code.trim(), name: name.trim() })
            .then(() => {
              setOpen(false);
              setCode("");
              setName("");
            })
            .catch(() => setError("That code may already be in use."));
        }}
      >
        Create
      </Button>
      <Button variant="quiet" size="sm" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </li>
  );
}

export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter };
