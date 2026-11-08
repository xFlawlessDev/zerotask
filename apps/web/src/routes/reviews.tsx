import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useReviewQueue, useDecideSubmission, useSubmissions } from "@/features/hooks";
import { useParams } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui/surface";
import { formatDateTime, formatHours } from "@/lib/format";
import type { ReviewQueueItem } from "@/lib/api/types";

/**
 * The review queue: submissions waiting on the person signed in.
 *
 * Approve and reject are the only two actions, and both ask for a note. The note is
 * required to reject, because "no" without a reason sends the submitter back with
 * nothing to act on.
 */
export default function ReviewsPage() {
  const { data, isLoading, error, refetch } = useReviewQueue();

  const [deciding, setDeciding] = useState<{ item: ReviewQueueItem; decision: "approved" | "rejected" } | null>(null);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);

  const approveReject = useDecideSubmission(deciding?.item.projectId ?? "");

  const submitDecision = async () => {
    if (!deciding) return;
    if (deciding.decision === "rejected" && note.trim().length === 0) {
      setNoteError("Say what needs to change, so the submitter can act on it.");
      return;
    }

    try {
      if (deciding.decision === "approved") {
        await approveReject.approve.mutateAsync({ submissionId: deciding.item.id, note: note.trim() || undefined });
      } else {
        await approveReject.reject.mutateAsync({ submissionId: deciding.item.id, note: note.trim() });
      }
      setDeciding(null);
      setNote("");
    } catch {
      // surfaced by the mutation's toast
    }
  };

  return (
    <>
      <PageHeader
        title="Reviews"
        description="Submissions waiting on your decision. Approving completes the task; rejecting sends it back to work."
      />

      <div className="p-4 sm:p-6">
        {error ? (
          <ErrorState
            description="The review queue could not be loaded. An empty queue and a failed request are different things, so nothing is shown as 'nothing to review' until the request succeeds."
            action={<Button onClick={() => void refetch()}>Try again</Button>}
          />
        ) : isLoading ? (
          <LoadingState label="Loading the review queue" />
        ) : (data?.length ?? 0) === 0 ? (
          <div className="rounded-panel border border-rule bg-surface">
            <EmptyState
              title="The queue is empty"
              description="When someone submits work on a task you review, it appears here with what they did and what it cost in hours."
            />
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {(data ?? []).map((item) => (
              <li key={item.id} className="rounded-panel border border-rule bg-surface">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-rule px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-compact font-medium text-ink">
                      <span className="tnum font-mono text-ink-muted">{item.taskCode}</span> {item.taskName}
                    </p>
                    <p className="mt-0.5 text-meta text-ink-muted">
                      {item.submitterName} · {formatDateTime(item.createdAt)} · {item.projectName}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setDeciding({ item, decision: "rejected" });
                        setNote("");
                        setNoteError(null);
                      }}
                    >
                      Request changes
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => {
                        setDeciding({ item, decision: "approved" });
                        setNote("");
                        setNoteError(null);
                      }}
                    >
                      Approve
                    </Button>
                  </div>
                </div>

                <div className="px-3 py-2.5">
                  {item.note && <p className="text-compact text-ink">{item.note}</p>}
                  <p className="mt-1 text-meta text-ink-muted">
                    {item.kind === "completion" ? "Completion" : item.kind === "handover" ? "Handover" : "Progress"}
                    {item.progressPercent !== null && ` · ${item.progressPercent}% of the task`}
                    {item.hoursSpent !== null && ` · ${formatHours(item.hoursSpent)} logged`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={deciding !== null} onOpenChange={(open) => !open && setDeciding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {deciding?.decision === "approved" ? "Approve this submission" : "Request changes"}
            </DialogTitle>
            <DialogDescription>
              {deciding?.decision === "approved"
                ? "The task is completed and its successors are rescheduled."
                : "The task returns to the submitter with your note."}
            </DialogDescription>
          </DialogHeader>

          <TextArea
            label="Note"
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
              setNoteError(null);
            }}
            rows={3}
            required={deciding?.decision === "rejected"}
            error={noteError}
            hint={deciding?.decision === "approved" ? "Optional, but it is recorded on the submission." : undefined}
          />

          <DialogFooter>
            <Button variant="quiet" onClick={() => setDeciding(null)}>
              Cancel
            </Button>
            <Button
              variant={deciding?.decision === "approved" ? "primary" : "danger"}
              onClick={() => void submitDecision()}
              disabled={approveReject.approve.isPending || approveReject.reject.isPending}
            >
              {deciding?.decision === "approved" ? "Approve" : "Send back"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export { useSubmissions, useParams, Link };
