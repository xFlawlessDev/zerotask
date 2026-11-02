import * as React from "react";
import { cn } from "@/lib/utils";

const CONTROL =
  "w-full min-w-0 rounded-control border border-input bg-surface px-2.5 text-compact text-ink transition-colors duration-100 outline-none placeholder:text-faint selection:bg-accent-wash selection:text-accent-ink focus-visible:border-ring aria-invalid:border-danger disabled:bg-sunk disabled:text-faint md:text-compact";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(CONTROL, "h-8 [&::-webkit-calendar-picker-indicator]:opacity-60", className)}
      {...props}
    />
  );
}

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(CONTROL, "min-h-16 resize-y py-1.5 field-sizing-content", className)}
      {...props}
    />
  );
}

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn("text-meta font-medium text-ink select-none", className)}
      {...props}
    />
  );
}

export { Input, Textarea, Label, CONTROL };
