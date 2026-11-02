import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useDocuments, useDocumentActions } from "@/features/hooks";
import { useRequiredSession } from "@/features/session";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, LoadingState, PageHeader } from "@/components/ui/surface";
import { IconDownload, IconPlus, IconSearch, IconTrash, IconUpload } from "@/components/icon";
import { formatDateTime } from "@/lib/format";
import { DOCUMENT_KINDS } from "@zerotask/domain";
import type { DocumentKind } from "@zerotask/domain";

/**
 * The document repository.
 *
 * One table, one upload dialog, one search. The kind filter is a select rather than
 * a row of buttons because there are six kinds and six buttons is a toolbar where a
 * filter belongs.
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
  const { capabilities } = useRequiredSession();

  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"all" | DocumentKind>("all");
  const [uploadOpen, setUploadOpen] = useState(false);

  const { data, isLoading } = useDocuments(undefined, search);
  const { remove } = useDocumentActions();

  const rows = (data?.items ?? []).filter(
    (row) => kind === "all" || row.kind === kind,
  );

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

        {isLoading ? (
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
            <table className="w-full text-left">
              <caption className="sr-only">Documents across all projects</caption>
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
                    <td className="max-w-0 px-3">
                      <span className="block truncate text-compact text-ink" title={row.note ?? row.name}>
                        {row.name}
                      </span>
                      <span className="block text-label text-faint">
                        {row.uploadedByName}
                        {row.version !== "1.0" && ` · v${row.version}`}
                      </span>
                    </td>
                    <td className="hidden px-3 text-meta text-ink-muted md:table-cell">{KIND_LABEL[row.kind] ?? row.kind}</td>
                    <td className="hidden px-3 lg:table-cell">
                      {row.projectId ? (
                        <Link
                          to="/projects/$projectId"
                          params={{ projectId: row.projectId }}
                          className="tnum font-mono text-meta text-accent-ink hover:underline"
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
                        <Button
                          variant="quiet"
                          aria-label={`Delete ${row.name}`}
                          onClick={() => {
                            if (window.confirm(`Delete ${row.code} ${row.name}? This cannot be undone.`)) {
                              remove.mutate(row.id);
                            }
                          }}
                          className="size-7 p-0 text-danger"
                        >
                          <IconTrash size={14} />
                        </Button>
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
    </>
  );
}

function UploadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { upload } = useDocumentActions();

  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<DocumentKind>("other");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    onOpenChange(false);
    setFile(null);
    setName("");
    setKind("other");
    setNote("");
    setError(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file && name.trim().length === 0) {
      setError("Attach a file, or give the document a name to register it as a reference.");
      return;
    }

    try {
      await upload.mutateAsync({
        file: file ?? undefined,
        name: name.trim() || file?.name,
        kind,
        note: note.trim() || undefined,
      });
      close();
    } catch {
      // surfaced by the mutation's toast
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a document</DialogTitle>
          <DialogDescription>
            Upload a file, or register a reference by name only. A code is generated for you.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3" noValidate>
          <label className="flex flex-col gap-1">
            <span className="text-meta font-medium text-ink">File</span>
            <label
              className={cnDropzone(!!file)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const dropped = event.dataTransfer.files[0];
                if (dropped) setFile(dropped);
              }}
            >
              <input
                type="file"
                className="sr-only"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                aria-label="Choose a file to upload"
              />
              <IconUpload className="text-faint" />
              <span className="text-compact text-ink">
                {file ? file.name : "Drop a file here, or choose one"}
              </span>
              <span className="text-meta text-ink-muted">Up to 25 MB. PDF, image, or office document.</span>
            </label>
          </label>

          <TextField
            label="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            hint={file ? "Defaults to the file name if left empty." : "Required when no file is attached."}
            error={error}
          />

          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Kind" value={kind} onChange={(event) => setKind(event.target.value as DocumentKind)}>
              {DOCUMENT_KINDS.map((value) => (
                <option key={value} value={value}>
                  {KIND_LABEL[value]}
                </option>
              ))}
            </SelectField>
          </div>

          <TextField label="Note" value={note} onChange={(event) => setNote(event.target.value)} hint="Optional. What this document is for." />

          <DialogFooter>
            <Button type="button" variant="quiet" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={upload.isPending}>
              {upload.isPending ? "Storing" : "Add document"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function cnDropzone(hasFile: boolean): string {
  return [
    "flex cursor-pointer flex-col items-center gap-1 rounded-control border border-dashed px-4 py-5 text-center transition-colors",
    hasFile ? "border-settled bg-sunk" : "border-rule hover:border-ink-muted hover:bg-sunk",
  ].join(" ");
}
