import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A panel is a flat surface divided from the page by the hairline, not by a
 * shadow. Shadow is reserved for menus and dialogs, which genuinely float.
 */
export function Panel({
  children,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div
      className={cn("rounded-panel border border-rule bg-surface", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 border-b border-rule px-3 py-2.5", className)}>
      <div className="min-w-0">
        <h2 className="text-section font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-meta text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}

/**
 * A figure with its own definition. The label states the rule that produced the
 * number ("due in the next 7 days"), because a count whose definition has to be
 * guessed is worse than no count.
 */
export function Figure({
  label,
  value,
  hint,
  tone = "default",
  emphasis,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "danger" | "caution" | "settled" | "accent";
  emphasis?: boolean;
}) {
  const toneClass =
    tone === "danger"
      ? "text-danger"
      : tone === "caution"
        ? "text-caution"
        : tone === "settled"
          ? "text-settled"
          : tone === "accent"
            ? "text-accent-ink"
            : "text-ink";

  return (
    <div className="min-w-0">
      <div className={cn("tnum font-semibold", emphasis ? "text-figure" : "text-title", toneClass)}>
        {value}
      </div>
      <div className="mt-0.5 text-meta text-muted-foreground">{label}</div>
      {hint && <div className="mt-1 text-label text-faint">{hint}</div>}
    </div>
  );
}

/**
 * Every data view has these three states, and each one says something. A bare
 * spinner with no text reads as a frozen page to a screen reader.
 */
export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-2 px-3 py-6 text-compact text-muted-foreground">
      <span
        aria-hidden="true"
        className="inline-block size-3 animate-spin rounded-full border border-rule border-t-accent"
      />
      {label}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  compact,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-1 px-3",
        compact ? "py-5" : "py-10",
      )}
    >
      <p className="text-compact font-medium text-ink">{title}</p>
      <p className="max-w-prose text-compact text-muted-foreground">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "That did not load",
  description,
  action,
}: {
  title?: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div role="alert" className="flex flex-col items-start gap-1 px-3 py-6">
      <p className="text-compact font-medium text-danger">{title}</p>
      <p className="max-w-prose text-compact text-muted-foreground">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** The header of every page: one title, one state summary, one primary action. */
export function PageHeader({
  title,
  description,
  meta,
  actions,
}: {
  title: string;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="border-b border-rule bg-canvas px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-title font-semibold tracking-tight text-ink">{title}</h1>
          {/* Rendered in a div, not a p: callers pass rich nodes, and HTML forbids
              a p inside a p. */}
          {description && <div className="mt-1 max-w-prose text-compact text-muted-foreground">{description}</div>}
          {meta && <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">{meta}</div>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>
    </header>
  );
}
