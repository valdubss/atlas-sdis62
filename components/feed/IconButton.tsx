"use client";

import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** Bouton icône 44 px (zone tactile confortable) avec libellé accessible. */
export function IconButton({
  label,
  active,
  count,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  active?: boolean;
  count?: number;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex h-11 items-center gap-1 rounded-full px-2 text-sm font-semibold transition-colors active:scale-90",
        active ? "text-red-text" : "text-body hover:text-navy",
        className,
      )}
      {...props}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-6 w-6"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.9"
        aria-hidden="true"
      >
        {children}
      </svg>
      {typeof count === "number" && count > 0 && <span className="tabular-nums">{count}</span>}
    </button>
  );
}
