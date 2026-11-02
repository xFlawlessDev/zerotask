import type { TaskPriority, TaskStatus, ProjectStatus, MilestoneStatus } from "@zerotask/domain";
import { PRIORITY_LABEL, PROJECT_STATUS_LABEL, STATUS_LABEL } from "@zerotask/domain";
import { cn } from "@/lib/utils";

/**
 * Status is never colour alone.
 *
 * Every status renders three things: a shape mark, the word, and a colour. The
 * shape survives colour blindness, greyscale printing, and forced-colours mode;
 * the word survives a reader who does not know the palette.
 */

type Tone = "neutral" | "accent" | "danger" | "caution" | "settled";

/**
 * Status text uses the palette's own ink colours (accent-ink, danger, caution,
 * settled), which are picked for text contrast in both themes. `text-accent` is
 * the accent-wash surface tone, not readable text, so it never appears here.
 */
const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-muted-foreground",
  accent: "text-accent-ink",
  danger: "text-danger",
  caution: "text-caution",
  settled: "text-settled",
};

const TONE_FILL: Record<Tone, string> = {
  neutral: "bg-muted-foreground/60",
  accent: "bg-accent-ink",
  danger: "bg-danger",
  caution: "bg-caution",
  settled: "bg-settled",
};

const TONE_BORDER: Record<Tone, string> = {
  neutral: "border-muted-foreground/60",
  accent: "border-accent-ink",
  danger: "border-danger",
  caution: "border-caution",
  settled: "border-settled",
};

/** Filled, half-filled, hollow, or struck: the four states work can be in. */
type Mark = "filled" | "half" | "hollow" | "struck";

function MarkGlyph({ mark, tone }: { mark: Mark; tone: Tone }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-2 shrink-0 rounded-mark",
        mark === "filled" && TONE_FILL[tone],
        mark === "half" && `border ${TONE_BORDER[tone]}`,
        mark === "hollow" && `border ${TONE_BORDER[tone]}`,
        mark === "struck" && `border ${TONE_BORDER[tone]}`,
      )}
    >
      {mark === "half" && (
        <span className={cn("block h-full w-1/2 rounded-mark", TONE_FILL[tone])} />
      )}
      {mark === "struck" && (
        <span className={cn("block h-px w-full translate-y-1 rotate-45", TONE_FILL[tone])} />
      )}
    </span>
  );
}

const STATUS_STYLE: Record<TaskStatus, { tone: Tone; mark: Mark }> = {
  not_started: { tone: "neutral", mark: "hollow" },
  in_progress: { tone: "accent", mark: "half" },
  pending_review: { tone: "caution", mark: "half" },
  blocked: { tone: "danger", mark: "struck" },
  completed: { tone: "settled", mark: "filled" },
  cancelled: { tone: "neutral", mark: "struck" },
};

export function StatusMark({ status }: { status: TaskStatus }) {
  const style = STATUS_STYLE[status];
  return <MarkGlyph mark={style.mark} tone={style.tone} />;
}

export function StatusLabel({ status, className }: { status: TaskStatus; className?: string }) {
  const style = STATUS_STYLE[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-compact", TONE_TEXT[style.tone], className)}>
      <MarkGlyph mark={style.mark} tone={style.tone} />
      {STATUS_LABEL[status]}
    </span>
  );
}

const PRIORITY_TONE: Record<TaskPriority, Tone> = {
  low: "neutral",
  medium: "neutral",
  high: "caution",
  critical: "danger",
};

/**
 * Priority is a word plus a bar count, not a coloured chip: the number of bars
 * carries the rank in greyscale.
 */
export function PriorityLabel({
  priority,
  className,
}: {
  priority: TaskPriority;
  className?: string;
}) {
  const bars = priority === "critical" ? 3 : priority === "high" ? 2 : priority === "medium" ? 1 : 0;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-compact", TONE_TEXT[PRIORITY_TONE[priority]], className)}>
      <span aria-hidden="true" className="inline-flex items-end gap-px">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className={cn(
              "w-[3px] rounded-[1px]",
              index < bars ? TONE_FILL[PRIORITY_TONE[priority]] : "bg-rule",
              index === 0 ? "h-1.5" : index === 1 ? "h-2" : "h-2.5",
            )}
          />
        ))}
      </span>
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

const PROJECT_TONE: Record<ProjectStatus, Tone> = {
  draft: "neutral",
  active: "accent",
  on_hold: "caution",
  completed: "settled",
  archived: "neutral",
};

const PROJECT_MARK: Record<ProjectStatus, Mark> = {
  draft: "hollow",
  active: "half",
  on_hold: "half",
  completed: "filled",
  archived: "struck",
};

export function ProjectStatusLabel({
  status,
  className,
}: {
  status: ProjectStatus;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-compact", TONE_TEXT[PROJECT_TONE[status]], className)}>
      <MarkGlyph mark={PROJECT_MARK[status]} tone={PROJECT_TONE[status]} />
      {PROJECT_STATUS_LABEL[status]}
    </span>
  );
}

const MILESTONE_LABEL: Record<MilestoneStatus, string> = {
  not_started: "Not reached",
  in_progress: "In progress",
  completed: "Reached",
};

const MILESTONE_TONE: Record<MilestoneStatus, Tone> = {
  not_started: "neutral",
  in_progress: "accent",
  completed: "settled",
};

export function MilestoneStatusLabel({ status }: { status: MilestoneStatus }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-compact", TONE_TEXT[MILESTONE_TONE[status]])}>
      <MarkGlyph
        mark={status === "completed" ? "filled" : status === "in_progress" ? "half" : "hollow"}
        tone={MILESTONE_TONE[status]}
      />
      {MILESTONE_LABEL[status]}
    </span>
  );
}

/**
 * A neutral tag for project labels. Its colour comes from the data, so it is a
 * bordered mark rather than a filled chip: a page of saturated chips is exactly
 * the decoration this direction refuses.
 */
export function Tag({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-mark border border-rule bg-surface px-1.5 py-0.5 text-label text-muted-foreground">
      <span aria-hidden="true" className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
      {name}
    </span>
  );
}

/** A count with a unit, used in headers where a bare number would be ambiguous. */
export function CountBadge({ value, label }: { value: number; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="tnum text-section font-semibold text-ink">{value}</span>
      <span className="text-meta text-muted-foreground">{label}</span>
    </span>
  );
}

export { TONE_TEXT, TONE_FILL, TONE_BORDER };
export type { Tone };
