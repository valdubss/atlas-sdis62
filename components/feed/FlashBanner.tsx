"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown, Info } from "lucide-react";
import type { FlashItem } from "@/lib/flash/queries";
import { cn } from "@/lib/cn";

/**
 * Flash du service en tête du fil : bandeau rouge (urgent) ou bleu (info).
 * Il ne se ferme pas tant qu'il est actif : l'agent peut seulement le replier.
 */
export function FlashBanner({ flashes }: { flashes: FlashItem[] }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  if (flashes.length === 0) return null;
  return (
    <div className="space-y-2">
      {flashes.map((f) => {
        const urgent = f.level === "urgent";
        const Icon = urgent ? AlertTriangle : Info;
        const isCollapsed = collapsed[f.id];
        const inner = (
          <>
            <Icon size={20} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold leading-snug">{f.title}</span>
              {f.body && !isCollapsed && <span className="mt-1 block whitespace-pre-line text-[13px] leading-snug opacity-90">{f.body}</span>}
              {f.url && !isCollapsed && <span className="mt-1.5 block text-[13px] font-medium underline underline-offset-2">Voir</span>}
            </span>
          </>
        );
        return (
          <div
            key={f.id}
            role={urgent ? "alert" : "status"}
            className={cn("flex items-start gap-3 rounded-[16px] px-4 py-3", urgent ? "bg-red-fill text-white" : "bg-navy text-white")}
          >
            {f.url ? (
              <Link href={f.url} className="flex min-w-0 flex-1 items-start gap-3">
                {inner}
              </Link>
            ) : (
              <div className="flex min-w-0 flex-1 items-start gap-3">{inner}</div>
            )}
            {(f.body || f.url) && (
              <button
                type="button"
                onClick={() => setCollapsed((c) => ({ ...c, [f.id]: !c[f.id] }))}
                aria-label={isCollapsed ? "Déplier" : "Replier"}
                aria-expanded={!isCollapsed}
                className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/80"
              >
                <ChevronDown size={18} strokeWidth={1.75} className={cn("transition-transform", isCollapsed && "-rotate-180")} aria-hidden="true" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
