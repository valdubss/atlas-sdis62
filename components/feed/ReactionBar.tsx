"use client";

import { REACTIONS, type ReactionKind } from "@/lib/config";
import type { ReactionCounts } from "@/lib/feed/types";
import { cn } from "@/lib/cn";

export function ReactionBar({
  counts,
  mine,
  onSelect,
  disabled,
}: {
  counts: ReactionCounts;
  mine: ReactionKind | null;
  onSelect: (kind: ReactionKind) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Réactions">
      {REACTIONS.map((r) => {
        const n = counts[r.kind] ?? 0;
        const active = mine === r.kind;
        return (
          <button
            key={r.kind}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(r.kind)}
            aria-pressed={active}
            aria-label={`${r.label}${n ? ` (${n})` : ""}`}
            className={cn(
              "flex h-10 min-w-10 select-none items-center gap-1 rounded-full px-2.5 text-sm font-semibold transition-all active:scale-90",
              active
                ? "bg-red/12 text-red-text ring-1 ring-red/40"
                : "bg-surface-2 text-body hover:bg-line",
              disabled && "opacity-60",
            )}
          >
            <span className={cn("text-lg leading-none", active && "animate-[pop_.3s_ease-out]")} aria-hidden="true">
              {r.emoji}
            </span>
            {n > 0 && <span className="tabular-nums">{n}</span>}
          </button>
        );
      })}
    </div>
  );
}
