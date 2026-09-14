"use client";

import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/** Bouton icône 44 px : icône Lucide 20 px, --text-2 au repos, --text-1 actif, jamais de fond. */
export function IconButton({
  label,
  icon: Icon,
  active,
  count,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  count?: number;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex h-11 min-w-11 items-center justify-center gap-1.5 px-1.5 text-[13px] font-medium tabular-nums",
        active ? "text-text-1" : "text-text-2 hover:text-text-1",
        className,
      )}
      {...props}
    >
      <Icon size={20} strokeWidth={1.75} fill={active ? "currentColor" : "none"} aria-hidden="true" />
      {typeof count === "number" && count > 0 && <span>{count}</span>}
    </button>
  );
}
