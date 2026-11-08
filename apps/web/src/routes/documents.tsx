import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useDocuments, useDocumentActions } from "@/features/hooks";
import { useRequiredSession } from "@/features/session";
import { UploadDialog } from "@/features/documents/upload-dialog";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/field";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/surface";
import { ConfirmDialog } from "@/components/ui/confirm";
import { IconDownload, IconPlus, IconSearch, IconTrash } from "@/components/icon";
import { formatDateTime } from "@/lib/format";
import { DOCUMENT_KINDS } from "@zerotask/domain";
import type { DocumentKind } from "@zerotask/domain";

/**
 * The document repository.
 *
 * One table, one upload dialog, one search. The kind filter is a select rather than
 * a row of buttons because there are six kinds and six buttons is a toolbar where a
 * filter belongs.
 *
 * A document belongs to a project (and optionally one of its tasks) or to the
 * workspace, and the upload dialog asks which. The previous version accepted only
 * a name, so every document it created was an orphan: the table could show a
 * "Belongs to" column that was always empty.
 */

const KIND_LABEL: Record<DocumentKind, string> = {
  report: "Report",
  photo: "Photo",
  spec: "Specification",
  drawing: "Drawing",
  checklist: "Checklist",
  other: "Other",
};

export default function DocumentsPage() {
  const { capabilities, person } = useRequiredSession();

  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"all" | DocumentKind>("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleting, setDeleting] = useState<{ id: string; label: string } | null>(null);

  const { data, isLoading, error, refetch } = useDocuments(undefined, search);
  const { remove } = useDocumentActions();

  const rows = (data?.items ?? []).filter(
    (row) => kind === "all" || row.kind === kind,
  );

  /** The server lets the uploader and an admin delete; nobody else may try. */
  const canDelete = (uploadedById: string) =>
    capabilities.managePeople || uploadedById === person.id;

  return (
    <>
      <PageHeader
        title="Documents"
        description="Specifications, reports, and evidence, with the task or project they belong to."
        actions={
          <Button variant="primary" onClick={() => setUploadOpen(true)} leading={<IconPlus />}>
            Add document
          </Button>
        }
      />

      <div className="p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative">
            <IconSearch className="pointer-events-none absolute top-2 left-2 text-faint" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or code"
              aria-label="Search documents"
              className="h-8 w-64 rounded-control border border-input bg-surface pr-2 pl-7 text-compact outline-none placeholder:text-faint focus-visible:border-ring"
            />
          </div>

          <div className="w-40">
            <SelectField label="Kind" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
              <option value="all">All kinds</option>
              {DOCUMENT_KINDS.map((value) => (
                <option key={value} value={value}>
                  {KIND_LABEL[value]}
                </option>
              ))}
            </SelectField>
          </div>

          {data && data.total > rows.length && (
            <span className="text-meta text-ink-muted">
              {rows.length} of {data.total}
            </span>
          )}
        </div>

        {error ? (
          <ErrorState
            description="The document list could not be loaded. Check your connection and try again."
            action={<Button onClick={() => void refetch()}>Try again</Button>}
          />
        ) : isLoading ? (
          <LoadingState label="Loading documents" />
        ) : rows.length === 0 ? (
          <div className="rounded-panel border border-rule bg-surface">
            <EmptyState
              title={search || kind !== "all" ? "Nothing matches" : "No documents yet"}
              description={
                search || kind !== "all"
                  ? "Adjust the search or the kind filter."
                  : "Upload a specification, a photo, or a signed report. Documents can be attached to a task or a whole project."
              }
              action={
                capabilities.createProject ? (
                  <Button variant="primary" onClick={() => setUploadOpen(true)}>
                    Upload the first document
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded-panel border border-rule bg-surface">
            <table className="w-full table-fixed text-left">
              <caption className="sr-only">Documents across all projects</caption>
              <colgroup>
                <col className="w-24" />
                <col />
                <col className="hidden md:table-column md:w-32" />
                <col className="hidden lg:table-column lg:w-56" />
                <col className="hidden lg:table-column lg:w-36" />
                <col className="w-16" />
              </colgroup>
              <thead>
                <tr className="border-b border-rule bg-sunk text-label font-medium text-ink-muted">
                  <th scope="col" className="px-3 py-2">Code</th>
                  <th scope="col" className="px-3 py-2">Name</th>
                  <th scope="col" className="hidden px-3 py-2 md:table-cell">Kind</th>
                  <th scope="col" className="hidden px-3 py-2 lg:table-cell">Belongs to</th>
                  <th scope="col" className="hidden px-3 py-2 lg:table-cell">Uploaded</th>
                  <th scope="col" className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {rows.map((row) => (
                  <tr key={row.id} className="h-(--row-height) transition-colors hover:bg-sunk">
                    <td className="tnum px-3 font-mono text-meta text-ink-muted">{row.code}</td>
                    <td className="min-w-0 px-3">
                      <span className="block truncate text-compact text-ink" title={row.note ?? row.name}>
                        {row.name}
                      </span>
                      <span className="block truncate text-label text-faint">
                        {row.uploadedByName}
                        {row.version !== "1.0" && ` · v${row.version}`}
                        {row.taskCode && ` · ${row.taskCode}`}
                      </span>
                    </td>
                    <td className="hidden px-3 text-meta text-ink-muted md:table-cell">{KIND_LABEL[row.kind] ?? row.kind}</td>
                    <td className="hidden min-w-0 px-3 lg:table-cell">
                      {row.projectId ? (
                        <Link
                          to="/projects/$projectId"
                          params={{ projectId: row.projectId }}
                          className="block truncate text-meta text-accent-ink hover:underline"
                          title={row.projectName ?? undefined}
                        >
                          {row.projectName}
                        </Link>
                      ) : (
                        <span className="text-meta text-faint">Workspace</span>
                      )}
                    </td>
                    <td className="tnum hidden px-3 text-meta text-ink-muted lg:table-cell">
                      {formatDateTime(row.createdAt)}
                    </td>
                    <td className="px-3">
                      <div className="flex justify-end gap-0.5">
                        {row.storageKey && (
                          <a
                            href={`/api/documents/${row.id}/file`}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Download ${row.name}`}
                            title={`Download ${row.name}`}
                            className="inline-flex size-7 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-sunk hover:text-ink"
                          >
                            <IconDownload size={14} />
                          </a>
                        )}
                        {canDelete(row.uploadedById) && (
                          <Button
                            variant="quiet"
                            aria-label={`Delete ${row.name}`}
                            onClick={() => setDeleting({ id: row.id, label: `${row.code} ${row.name}` })}
                            className="size-7 p-0 text-danger"
                          >
                            <IconTrash size={14} />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this document?"
        description={
          deleting
            ? `${deleting.label} will be removed from the repository and every list that shows it. The file itself is deleted. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete document"
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
          setDeleting(null);
        }}
      />
    </>
  );
}
