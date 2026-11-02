import { useState } from "react";
import { useCreateTask, useDeleteTask, useMoveTask, useUpdateTask } from "@/features/hooks";
import { Button } from "@/components/ui/button";
import { DateField, NumberField, SelectField, TextArea, TextField } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ProjectDetail, Task } from "@/lib/api/types";
import type { TaskPriority } from "@zerotask/domain";

export function TaskEditor({ project, task, canManagePlan, onClose }: { project: ProjectDetail; task: Task | null; canManagePlan: boolean; onClose: () => void }) {
  const [name, setName] = useState(task?.name ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "medium");
  const [assignee, setAssignee] = useState(task?.assigneeId ?? "");
  const [reviewer, setReviewer] = useState(task?.reviewerId ?? "");
  const [milestone, setMilestone] = useState(task?.milestoneId ?? "");
  const [duration, setDuration] = useState(String(task?.durationDays ?? 1));
  const [start, setStart] = useState(task?.plannedStartDate ?? "");
  const [end, setEnd] = useState(task?.plannedEndDate ?? "");
  const [status, setStatus] = useState(task?.status);
  const [error, setError] = useState("");
  const create = useCreateTask(project.id);
  const update = useUpdateTask(project.id, task?.id ?? "");
  const remove = useDeleteTask(project.id);
  const move = useMoveTask(project.id);
  const busy = create.isPending || update.isPending || remove.isPending || move.isPending;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim().length < 2) { setError("Enter a task name with at least 2 characters."); return; }
    if (start && end && end < start) { setError("End date must be on or after the start date."); return; }
    setError("");
    const fields = { name: name.trim(), description: description.trim() || null, priority, assignedToId: assignee || null, reviewerId: reviewer || null, milestoneId: milestone || null };
    const plan = { durationDays: Number(duration), plannedStartDate: start || null, plannedEndDate: end || null };
    try {
      if (task) await update.mutateAsync({ ...fields, ...(canManagePlan ? plan : {}) });
      else await create.mutateAsync({ ...fields, ...plan });
      onClose();
    } catch { /* The mutation reports the server error. */ }
  }

  async function deleteTask() {
    if (!task || !window.confirm(`Delete ${task.code} ${task.name}?`)) return;
    try { await remove.mutateAsync(task.id); onClose(); } catch { /* Reported by the mutation. */ }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task ? `Manage ${task.code}` : "New task"}</DialogTitle>
          <DialogDescription>{task ? "Update the task or its assignment." : `Add work to ${project.name}.`}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void save(event)} className="flex flex-col gap-3">
          <TextField label="Task name" required minLength={2} maxLength={200} value={name} onChange={(event) => setName(event.target.value)} />
          <TextArea label="Description" maxLength={4000} value={description} onChange={(event) => setDescription(event.target.value)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField label="Priority" value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>{["low", "medium", "high", "critical"].map((value) => <option key={value} value={value}>{value[0]!.toUpperCase() + value.slice(1)}</option>)}</SelectField>
            <SelectField label="Assignee" value={assignee} onChange={(event) => setAssignee(event.target.value)}><option value="">Unassigned</option>{project.members.map((member) => <option key={member.userId} value={member.userId}>{member.name ?? member.email}</option>)}</SelectField>
            <SelectField label="Reviewer" value={reviewer} onChange={(event) => setReviewer(event.target.value)}><option value="">None</option>{project.members.map((member) => <option key={member.userId} value={member.userId}>{member.name ?? member.email}</option>)}</SelectField>
            <SelectField label="Milestone" value={milestone} onChange={(event) => setMilestone(event.target.value)}><option value="">None</option>{project.milestones.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectField>
          </div>
          {(!task || canManagePlan) && <div className="grid gap-3 sm:grid-cols-3">
            <NumberField label="Duration (days)" required min={1} max={3650} step={1} value={duration} onChange={(event) => setDuration(event.target.value)} />
            <DateField label="Start date" value={start} onChange={(event) => setStart(event.target.value)} />
            <DateField label="End date" value={end} onChange={(event) => setEnd(event.target.value)} />
          </div>}
          {task && status !== "pending_review" && status !== "completed" && <SelectField label="Status" hint="Status changes are saved immediately." value={status} disabled={busy} onChange={(event) => { const next = event.target.value as "not_started" | "in_progress" | "blocked" | "cancelled"; void move.mutateAsync({ taskId: task.id, status: next }).then(() => setStatus(next)).catch(() => {}); }}>
            <option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="cancelled">Cancelled</option>
          </SelectField>}
          {task && (status === "pending_review" || status === "completed") && <p className="text-meta text-ink-muted">Status: {status === "pending_review" ? "Awaiting review" : "Completed"}. Completion is handled through review.</p>}
          {error && <p role="alert" className="text-compact text-danger">{error}</p>}
          <DialogFooter>
            {task && canManagePlan && <Button variant="danger" disabled={busy} onClick={() => void deleteTask()}>Delete task</Button>}
            <Button disabled={busy} onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={busy}>{busy ? "Saving…" : task ? "Save changes" : "Create task"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
