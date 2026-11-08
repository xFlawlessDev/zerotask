import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
/**
 * Four variants and two sizes, which is the whole button vocabulary of this app.
 *
 * No shadow: buttons sit on the surface and lift by tone, not by elevation, so the
 * only shadow in the product marks a genuinely floating panel.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-control border font-medium transition-colors duration-100 outline-none disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "border-accent-ink bg-accent-ink text-on-accent hover:brightness-110 active:brightness-95",
        secondary: "border-rule bg-surface text-ink hover:bg-sunk active:bg-sunk",
        quiet:
          "border-transparent bg-transparent text-ink-muted hover:bg-sunk hover:text-ink",
        danger:
          "border-danger bg-transparent text-danger hover:bg-danger hover:text-surface",
        /** The confirming button in a destructive dialog: it must read as final. */
        "danger-filled": "border-danger bg-danger text-surface hover:brightness-110 active:brightness-95",
        link: "border-transparent bg-transparent text-accent-ink underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-7 px-2 text-meta",
        default: "h-8 px-3 text-compact",
        lg: "h-10 px-4 text-body",
        icon: "size-8 px-0",
      },
    },
    defaultVariants: { variant: "secondary", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  leading,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean; leading?: React.ReactNode }) {
  // Slot needs exactly one child, so `leading` only applies to real buttons. A
  // caller using asChild puts the icon inside the child element itself.
  if (asChild) {
    return (
      <Slot
        data-slot="button"
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      >
        {children}
      </Slot>
    );
  }

  return (
    <button
      type="button"
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {leading}
      {children}
    </button>
  );
}

export { Button, buttonVariants };

/** A button that only holds an icon still needs a name; this one requires it. */
function IconButton({
  label,
  className,
  variant,
  ...props
}: Omit<React.ComponentProps<"button">, "aria-label"> &
  VariantProps<typeof buttonVariants> & { label: string }) {
  return (
    <button
      type="button"
      data-slot="icon-button"
      aria-label={label}
      title={label}
      className={cn(buttonVariants({ variant, size: "icon", className }))}
      {...props}
    />
  );
}

export { IconButton };
