import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTemplates, useTemplateActions, useTemplate } from "@/features/hooks";
import { useRequiredSession } from "@/features/session";
import { Button } from "@/components/ui/button";
import { DateField, SelectField, TextArea, TextField } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, Figure, LoadingState, PageHeader } from "@/components/ui/surface";
import { formatShortDate } from "@/lib/format";

/**
 * Templates: the shapes of deliveries, ready to stamp.
 *
 * An admin maintains them; anyone who can create a project can instantiate one.
 * The card shows the shape's weight, task count and total duration, because that is
 * what makes a template worth reaching for instead of starting from nothing.
 */
export default function TemplatesPage() {
  const { capabilities } = useRequiredSession();
  const navigate = useNavigate();
  const { data, isLoading } = useTemplates();
  const { remove, instantiate } = useTemplateActions();

  const [instantiating, setInstantiating] = useState<string | null>(null);

  const templates = data ?? [];

  return (
    <>
      <PageHeader
        title="Templates"
        description="Reusable delivery shapes. Instantiating one creates a project with its tasks and dependency graph already in place."
      />

      <div className="p-4 sm:p-6">
        {isLoading ? (
          <LoadingState label="Loading templates" />
        ) : templates.length === 0 ? (
          <div className="rounded-panel border border-rule bg-surface">
            <EmptyState
              title="No templates yet"
              description="Capture an existing project as a template, or ask an admin to create one. A template is the shape of the work: tasks, durations, and how they depend on each other."
            />
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {templates.map((template) => (
              <li key={template.id} className="flex flex-col rounded-panel border border-rule bg-surface">
                <div className="flex-1 px-3 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="text-compact font-semibold text-ink">{template.name}</h2>
                    <span className="tnum font-mono text-label text-faint">{template.code}</span>
                  </div>
                  {template.description && (
                    <p className="mt-1 line-clamp-2 text-meta text-ink-muted">{template.description}</p>
                  )}
                  <div className="mt-3 flex gap-5">
                    <Figure value={template.taskCount} label="tasks" />
                    <Figure value={`${template.totalDurationDays}d`} label="total duration" />
                    <Figure value={template.usageCount} label="projects stamped" />
                  </div>
                </div>

                <div className="flex items-center gap-1.5 border-t border-rule px-3 py-2">
                  <span className="rounded-mark bg-sunk px-1.5 py-0.5 text-label text-ink-muted">
                    {template.category}
                  </span>
                  <span className="flex-1" />
                  {capabilities.createProject && (
                    <Button variant="primary" size="sm" onClick={() => setInstantiating(template.id)}>
                      Create project
                    </Button>
                  )}
                  {capabilities.manageTemplates && (
                    <Button
                      variant="quiet"
                      size="sm"
                      onClick={() => {
                        if (window.confirm(`Delete the ${template.name} template? Projects already stamped from it are unaffected.`)) {
                          remove.mutate(template.id);
                        }
                      }}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <InstantiateDialog
        templateId={instantiating}
        onClose={() => setInstantiating(null)}
        onCreated={(created) => void navigate({ to: "/projects/$projectId", params: { projectId: created.id } })}
        instantiate={instantiate}
      />
    </>
  );
}

function InstantiateDialog({
  templateId,
  onClose,
  onCreated,
  instantiate,
}: {
  templateId: string | null;
  onClose: () => void;
  onCreated: (created: { id: string; code: string; name: string }) => void;
  instantiate: ReturnType<typeof useTemplateActions>["instantiate"];
}) {
  const { data: template } = useTemplate(templateId ?? undefined);

  const [name, setName] = useState("");
  const [kickoffDate, setKickoffDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setName("");
    setError(null);
    onClose();
  };

  return (
    <Dialog open={templateId !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a project from {template?.name ?? "template"}</DialogTitle>
          <DialogDescription>
            {template
              ? "Its tasks and their dependency graph are copied in. Assignees and dates are not: they belong to the project, not the shape."
              : "Loading the template."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim().length < 2 || !templateId) {
              setError("Give the project a name of at least two characters.");
              return;
            }
            instantiate
              .mutateAsync({ id: templateId, name: name.trim(), kickoffDate: kickoffDate || null })
              .then(onCreated)
              .catch(() => setError("That did not work. The name may already be taken."));
          }}
          className="flex flex-col gap-3"
          noValidate
        >
          <TextField
            label="Project name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            error={error}
          />
          <DateField
            label="Kickoff date"
            value={kickoffDate}
            onChange={(event) => setKickoffDate(event.target.value)}
          />

          <DialogFooter>
            <Button type="button" variant="quiet" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={instantiate.isPending}>
              {instantiate.isPending ? "Creating" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { SelectField, TextArea, formatShortDate };
