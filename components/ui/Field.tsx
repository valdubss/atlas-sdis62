import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** Champ : --bg-1, 44 px, rayon 10 px, sans bordure, liseré --glass-edge en focus. */
const baseInput =
  "block w-full rounded-[10px] bg-bg-1 px-3.5 text-[15px] text-text-1 outline-none ring-1 ring-transparent focus:ring-glass-edge [.bg-bg-1_&]:bg-bg-2";

function Messages({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  if (error)
    return (
      <p id={`${id}-error`} className="text-[13px] text-red-text" role="alert">
        {error}
      </p>
    );
  if (hint)
    return (
      <p id={`${id}-hint`} className="text-[13px] text-text-3">
        {hint}
      </p>
    );
  return null;
}

function Label({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <label htmlFor={id} className="block text-[13px] font-medium text-text-2">
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
        className={cn(baseInput, "h-11", error && "ring-red")}
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
        className={cn(baseInput, "min-h-32 py-2.5 leading-[1.45]", error && "ring-red")}
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
        className={cn(baseInput, "h-11 appearance-none", error && "ring-red")}
        {...props}
      >
        {children}
      </select>
      <Messages id={id} error={error} hint={hint} />
    </div>
  );
}

/** Rangée à bascule façon Réglages : libellé à gauche, interrupteur à droite. */
export function CheckboxField({
  label,
  name,
  hint,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; name: string; hint?: string }) {
  const id = `field-${name}`;
  return (
    <label htmlFor={id} className={cn("flex min-h-11 cursor-pointer items-center justify-between gap-4", className)}>
      <span>
        <span className="block text-[15px] text-text-1">{label}</span>
        {hint && <span className="block text-[13px] text-text-3">{hint}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input id={id} name={name} type="checkbox" className="peer sr-only" {...props} />
        <span
          aria-hidden="true"
          className="h-[30px] w-[50px] rounded-full bg-bg-2 transition-colors peer-checked:bg-text-1 peer-focus-visible:ring-1 peer-focus-visible:ring-glass-edge"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-[3px] top-[3px] h-6 w-6 rounded-full bg-text-1 transition-transform peer-checked:translate-x-5 peer-checked:bg-bg-0"
        />
      </span>
    </label>
  );
}
