"use client";

import { BicepsFlexed, Flame, Heart, ThumbsUp, type LucideIcon } from "lucide-react";
import { REACTIONS, type ReactionKind } from "@/lib/config";
import type { ReactionCounts } from "@/lib/feed/types";
import { cn } from "@/lib/cn";

const ICONS: Record<ReactionKind, LucideIcon> = { clap: ThumbsUp, fire: Flame, heart: Heart, muscle: BicepsFlexed };

/** Ligne de réactions minimale : icône Lucide + compte, actif en --red. */
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
    <div className="flex items-center" role="group" aria-label="Réactions">
      {REACTIONS.map((r) => {
        const n = counts[r.kind] ?? 0;
        const active = mine === r.kind;
        const Icon = ICONS[r.kind];
        return (
          <button
            key={r.kind}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(r.kind)}
            aria-pressed={active}
            aria-label={`${r.label}${n ? ` (${n})` : ""}`}
            className={cn(
              "flex h-11 min-w-11 items-center justify-center gap-1.5 px-1.5 text-[13px] font-medium tabular-nums",
              active ? "text-red-text" : "text-text-2 hover:text-text-1",
              disabled && "opacity-60",
            )}
          >
            <Icon size={20} strokeWidth={1.75} fill={active ? "currentColor" : "none"} className={active ? "text-red" : undefined} aria-hidden="true" />
            {n > 0 && <span>{n}</span>}
          </button>
        );
      })}
    </div>
  );
}
