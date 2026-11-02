import * as React from "react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { cn } from "@/lib/utils";

/**
 * A segmented control: a row of mutually exclusive options inside one hairline
 * frame. The chosen option gets the accent wash, the same quiet marker the
 * navigation uses for the current page.
 */
function ToggleGroup({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      className={cn("inline-flex items-center gap-0.5 rounded-control border border-rule bg-surface p-0.5", className)}
      {...props}
    />
  );
}

function ToggleGroupItem({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        "inline-flex h-6 items-center justify-center rounded-control px-2.5 text-meta font-medium text-ink-muted outline-none transition-colors duration-100",
        "hover:text-ink focus-visible:bg-sunk data-[state=on]:bg-accent-wash data-[state=on]:text-accent-ink",
        className,
      )}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
