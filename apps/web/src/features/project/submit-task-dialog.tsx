import { useState } from "react";
import { useSubmitForReview } from "@/features/hooks";
import { Button } from "@/components/ui/button";
import { NumberField, SelectField, TextArea } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Task } from "@/lib/api/types";

export function SubmitTaskDialog({ task, onClose }: { task: Task; onClose: () => void }) {
  const submit = useSubmitForReview(task.projectId);
  const [kind, setKind] = useState<"completion" | "progress" | "handover">("completion");
  const [note, setNote] = useState("");
  const [progress, setProgress] = useState(String(task.progressPercent));
  const [hours, setHours] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      await submit.mutateAsync({ taskId: task.id, body: { kind, note: note.trim() || null, progressPercent: kind === "completion" ? 100 : Number(progress), hoursSpent: hours ? Number(hours) : null } });
      onClose();
    } catch { /* The mutation displays the error. */ }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !submit.isPending) onClose(); }}><DialogContent>
    <DialogHeader><DialogTitle>Submit for review</DialogTitle><DialogDescription>{task.code} · {task.name}. The assigned reviewer or a project manager will receive this submission.</DialogDescription></DialogHeader>
    <form onSubmit={(event) => void save(event)} className="flex flex-col gap-3">
      <SelectField label="Submission type" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="completion">Completion</option><option value="progress">Progress</option><option value="handover">Handover</option></SelectField>
      <TextArea label="Notes for reviewer" value={note} maxLength={4000} onChange={(event) => setNote(event.target.value)} />
      <div className="grid gap-3 sm:grid-cols-2">{kind !== "completion" && <NumberField label="Progress (%)" required min={0} max={100} step={1} value={progress} onChange={(event) => setProgress(event.target.value)} />}<NumberField label="Hours spent (optional)" min={0} max={10000} step="0.25" value={hours} onChange={(event) => setHours(event.target.value)} /></div>
      <DialogFooter><Button onClick={onClose} disabled={submit.isPending}>Cancel</Button><Button type="submit" variant="primary" disabled={submit.isPending}>{submit.isPending ? "Submitting…" : "Submit for review"}</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}
