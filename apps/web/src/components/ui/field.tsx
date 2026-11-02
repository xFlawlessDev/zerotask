import * as React from "react";
import { useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { IconEye, IconEyeOff } from "@/components/icon";
import { Input, Label, CONTROL } from "@/components/ui/input";

/**
 * Every field has a visible label bound to its control, and every error is text
 * before it is a border colour. A placeholder is never the label: it disappears
 * exactly when the person needs it.
 */

interface FieldShellProps {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

function FieldShell({ label, htmlFor, hint, error, required, children, className }: FieldShellProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && (
          <span className="ml-0.5 text-danger" aria-hidden="true">
            *
          </span>
        )}
      </Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-meta text-danger">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${htmlFor}-hint`} className="text-meta text-ink-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

function TextField({
  label,
  hint,
  error,
  required,
  className,
  id,
  ...rest
}: React.ComponentProps<"input"> & {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  className?: string;
}) {
  const generated = React.useId();
  const fieldId = id ?? generated;

  return (
    <FieldShell
      label={label}
      htmlFor={fieldId}
      hint={hint}
      error={error}
      required={required}
      className={className}
    >
      <Input
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        aria-errormessage={error ? `${fieldId}-error` : undefined}
        className={cn(error && "border-danger")}
        {...rest}
      />
    </FieldShell>
  );
}

function NumberField({
  label,
  hint,
  error,
  required,
  suffix,
  ...rest
}: Omit<React.ComponentProps<"input">, "type"> & {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  suffix?: string;
}) {
  const generated = React.useId();
  const fieldId = rest.id ?? generated;

  return (
    <FieldShell label={label} htmlFor={fieldId} hint={hint} error={error} required={required}>
      <div className="flex items-center gap-1.5">
        <Input
          id={fieldId}
          type="number"
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
          className={cn("tnum", error && "border-danger")}
          {...rest}
        />
        {suffix && <span className="text-meta text-ink-muted">{suffix}</span>}
      </div>
    </FieldShell>
  );
}

function DateField({
  label,
  hint,
  error,
  required,
  ...rest
}: Omit<React.ComponentProps<"input">, "type"> & {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}) {
  const generated = React.useId();
  const fieldId = rest.id ?? generated;

  return (
    <FieldShell label={label} htmlFor={fieldId} hint={hint} error={error} required={required}>
      <Input
        id={fieldId}
        type="date"
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className={cn("tnum", error && "border-danger")}
        {...rest}
      />
    </FieldShell>
  );
}

function PasswordField({
  label,
  hint,
  error,
  required,
  ...rest
}: Omit<React.ComponentProps<"input">, "type"> & {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}) {
  const generated = React.useId();
  const fieldId = rest.id ?? generated;
  const [visible, setVisible] = useState(false);

  return (
    <FieldShell label={label} htmlFor={fieldId} hint={hint} error={error} required={required}>
      <div className="relative">
        <input
          id={fieldId}
          type={visible ? "text" : "password"}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
          className={cn(CONTROL, "h-8 pr-9", error && "border-danger")}
          {...rest}
        />
        <button
          type="button"
          aria-label={visible ? "Hide password" : "Show password"}
          onClick={() => setVisible((value) => !value)}
          className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-sunk hover:text-ink"
        >
          {visible ? <IconEyeOff size={14} /> : <IconEye size={14} />}
        </button>
      </div>
    </FieldShell>
  );
}

function TextArea({
  label,
  hint,
  error,
  required,
  rows = 3,
  ...rest
}: React.ComponentProps<"textarea"> & {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}) {
  const generated = React.useId();
  const fieldId = rest.id ?? generated;

  return (
    <FieldShell label={label} htmlFor={fieldId} hint={hint} error={error} required={required}>
      <textarea
        id={fieldId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className={cn(
          "w-full min-h-16 resize-y rounded-control border border-input bg-surface px-2.5 py-1.5 text-compact text-ink transition-colors duration-100 outline-none placeholder:text-faint focus-visible:border-ring aria-invalid:border-danger disabled:bg-sunk disabled:text-faint",
          error && "border-danger",
        )}
        {...rest}
      />
    </FieldShell>
  );
}

function SelectField({
  label,
  hint,
  error,
  required,
  children,
  ...rest
}: React.ComponentProps<"select"> & {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  const generated = React.useId();
  const fieldId = rest.id ?? generated;

  return (
    <FieldShell label={label} htmlFor={fieldId} hint={hint} error={error} required={required}>
      <select
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className={cn(
          "h-8 w-full rounded-control border border-input bg-surface px-2.5 text-compact text-ink outline-none transition-colors duration-100 focus-visible:border-ring aria-invalid:border-danger disabled:bg-sunk disabled:text-faint",
          error && "border-danger",
        )}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
}

function Checkbox({
  label,
  hint,
  ...rest
}: Omit<React.ComponentProps<"input">, "type"> & { label: string; hint?: ReactNode }) {
  const generated = React.useId();
  const fieldId = rest.id ?? generated;

  return (
    <div className="flex items-start gap-2">
      <input
        id={fieldId}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 accent-[var(--accent-ink)]"
        {...rest}
      />
      <div className="min-w-0">
        <Label htmlFor={fieldId} className="text-compact font-normal text-ink">
          {label}
        </Label>
        {hint && <p className="text-meta text-ink-muted">{hint}</p>}
      </div>
    </div>
  );
}

/** A switch for an immediate, reversible preference. */
function Switch({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="min-w-0">
        <div className="text-compact text-ink">{label}</div>
        {hint && <div className="text-meta text-ink-muted">{hint}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors duration-150",
          checked ? "border-accent-ink bg-accent-ink" : "border-rule bg-sunk",
          disabled && "opacity-45",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-0.5 size-3.5 rounded-full bg-surface transition-[left] duration-150",
            checked ? "left-[18px]" : "left-0.5",
          )}
        />
      </button>
    </div>
  );
}

export {
  FieldShell,
  TextField,
  NumberField,
  DateField,
  PasswordField,
  TextArea,
  SelectField,
  Checkbox,
  Switch,
};
