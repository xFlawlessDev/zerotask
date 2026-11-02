import * as React from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A flat surface divided from the page by the hairline, not by a shadow.
 *
 * `ring-1 ring-rule` rather than `border` because a card that sits flush inside a
 * bordered container should not double the line between them.
 */
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn("flex flex-col rounded-panel border border-rule bg-card text-card-foreground", className)}
      {...props}
    />
  );
}

function CardHeader({
  title,
  description,
  action,
  className,
  ...props
}: React.ComponentProps<"div"> & { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex items-start justify-between gap-3 border-b border-rule px-3 py-2.5", className)}
      {...props}
    >
      <div className="min-w-0">
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </div>
      {action && <CardAction>{action}</CardAction>}
    </div>
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="card-title"
      className={cn("text-section font-semibold text-ink", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="card-description"
      className={cn("text-meta text-ink-muted", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-action" className={cn("flex shrink-0 items-center gap-1.5", className)} {...props} />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-3 py-2.5", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center gap-1.5 border-t border-rule px-3 py-2", className)}
      {...props}
    />
  );
}

export { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter };
