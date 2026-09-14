import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const baseInput =
  "block w-full rounded-xl border border-line bg-surface px-3 text-base text-body placeholder:text-muted/70 focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/30";

function Messages({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  if (error)
    return (
      <p id={`${id}-error`} className="text-sm text-danger" role="alert">
        {error}
      </p>
    );
  if (hint)
    return (
      <p id={`${id}-hint`} className="text-xs text-muted">
        {hint}
      </p>
    );
  return null;
}

function Label({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <label htmlFor={id} className="block text-sm font-semibold text-navy">
      {children}
    </label>
  );
}

export function Field({
  label,
  name,
  error,
  hint,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  name: string;
  error?: string;
  hint?: string;
}) {
  const id = `field-${name}`;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label id={id}>{label}</Label>
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(baseInput, "h-11", error && "border-danger focus:border-danger focus:ring-danger/30")}
        {...props}
      />
      <Messages id={id} error={error} hint={hint} />
    </div>
  );
}

export function TextareaField({
  label,
  name,
  error,
  hint,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  name: string;
  error?: string;
  hint?: string;
}) {
  const id = `field-${name}`;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label id={id}>{label}</Label>
      <textarea
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(baseInput, "min-h-32 py-2.5 leading-relaxed", error && "border-danger")}
        {...props}
      />
      <Messages id={id} error={error} hint={hint} />
    </div>
  );
}

export function SelectField({
  label,
  name,
  error,
  hint,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  name: string;
  error?: string;
  hint?: string;
}) {
  const id = `field-${name}`;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label id={id}>{label}</Label>
      <select
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        className={cn(baseInput, "h-11", error && "border-danger")}
        {...props}
      >
        {children}
      </select>
      <Messages id={id} error={error} hint={hint} />
    </div>
  );
}

export function CheckboxField({
  label,
  name,
  hint,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; name: string; hint?: string }) {
  const id = `field-${name}`;
  return (
    <label htmlFor={id} className={cn("flex cursor-pointer items-start gap-3", className)}>
      <input
        id={id}
        name={name}
        type="checkbox"
        className="mt-0.5 h-5 w-5 rounded border-line accent-red"
        {...props}
      />
      <span>
        <span className="block text-sm font-semibold text-navy">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}
