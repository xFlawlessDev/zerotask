import { useState } from "react";
import { useDocumentActions, useProjectTasks, useProjects } from "@/features/hooks";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SelectField, TextField } from "@/components/ui/field";
import { IconUpload } from "@/components/icon";
import { DOCUMENT_KINDS } from "@zerotask/domain";
import type { DocumentKind } from "@zerotask/domain";

/**
 * The one upload form, used by the repository and by a project's own documents
 * tab.
 *
 * A document without a project is a workspace reference; a document with one is
 * attached, and the project page passes `projectId` so the attachment is the
 * default rather than something the person has to remember to pick.
 */

const KIND_LABEL: Record<DocumentKind, string> = {
  report: "Report",
  photo: "Photo",
  spec: "Specification",
  drawing: "Drawing",
  checklist: "Checklist",
  other: "Other",
};

export function UploadDialog({
  open,
  onOpenChange,
  projectId: fixedProjectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the document goes to this project and the picker is not shown. */
  projectId?: string;
}) {
  const { upload } = useDocumentActions();

  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<DocumentKind>("other");
  const [note, setNote] = useState("");
  const [chosenProject, setChosenProject] = useState("");
  const [taskId, setTaskId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: projects } = useProjects({});
  const projectId = fixedProjectId ?? chosenProject;
  const { data: tasks } = useProjectTasks(projectId || undefined);
  const projectTasks = projectId ? (tasks?.items ?? []) : [];

  const close = () => {
    onOpenChange(false);
    setFile(null);
    setName("");
    setKind("other");
    setNote("");
    setChosenProject("");
    setTaskId("");
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
        projectId: projectId || undefined,
        taskId: taskId || undefined,
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
          <div className="flex flex-col gap-1">
            <span className="text-meta font-medium text-ink">File</span>
            <label
              className={dropzoneClass(!!file)}
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
          </div>

          <TextField
            label="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            hint={file ? "Defaults to the file name if left empty." : "Required when no file is attached."}
            error={error}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField label="Kind" value={kind} onChange={(event) => setKind(event.target.value as DocumentKind)}>
              {DOCUMENT_KINDS.map((value) => (
                <option key={value} value={value}>
                  {KIND_LABEL[value]}
                </option>
              ))}
            </SelectField>

            {fixedProjectId ? (
              <SelectField
                label="Task"
                value={taskId}
                onChange={(event) => setTaskId(event.target.value)}
                hint="Optional. Attaches the document to one task."
              >
                <option value="">Whole project</option>
                {projectTasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.code} · {task.name}
                  </option>
                ))}
              </SelectField>
            ) : (
              <SelectField
                label="Project"
                value={chosenProject}
                onChange={(event) => {
                  setChosenProject(event.target.value);
                  // A task belongs to one project, so a stale task would point the
                  // document at something the person can no longer see here.
                  setTaskId("");
                }}
                hint="Leave empty for a workspace document."
              >
                <option value="">Workspace (no project)</option>
                {(projects?.items ?? []).map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.code} · {project.name}
                  </option>
                ))}
              </SelectField>
            )}
          </div>

          {!fixedProjectId && projectId && (
            <SelectField
              label="Task"
              value={taskId}
              onChange={(event) => setTaskId(event.target.value)}
              hint="Optional. Attaches the document to one task inside the project."
            >
              <option value="">Whole project</option>
              {projectTasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.code} · {task.name}
                </option>
              ))}
            </SelectField>
          )}

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

function dropzoneClass(hasFile: boolean): string {
  return [
    "flex cursor-pointer flex-col items-center gap-1 rounded-control border border-dashed px-4 py-5 text-center transition-colors",
    hasFile ? "border-settled bg-sunk" : "border-rule hover:border-ink-muted hover:bg-sunk",
  ].join(" ");
}
