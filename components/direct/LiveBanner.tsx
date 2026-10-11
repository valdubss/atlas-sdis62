"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Eye } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { LiveItem } from "@/lib/direct/types";
import { useLiveViewers } from "./useLiveViewers";

/**
 * Bandeau « EN DIRECT » collé sous l'en-tête du fil tant que le Direct est actif : titre,
 * nombre d'agents qui suivent, accès au direct. Disparaît seul à la clôture (temps réel).
 */
export function LiveBanner({ live, userId }: { live: LiveItem; userId: string | null }) {
  const [active, setActive] = useState(live.status === "live");
  const viewers = useLiveViewers(active ? live.id : null, userId, false);
  const router = useRouter();

  useEffect(() => setActive(live.status === "live"), [live.status]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`live-status:${live.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "lives", filter: `id=eq.${live.id}` }, (payload) => {
        const status = (payload.new as { status?: string }).status;
        if (status && status !== "live") {
          setActive(false);
          router.refresh();
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [live.id, router]);

  if (!active) return null;
  return (
    <div className="sticky top-[calc(48px+env(safe-area-inset-top)+6px)] z-20">
      <Link href={`/direct/${live.id}`} className="pressable flex items-center gap-3 rounded-[16px] bg-red-fill px-4 py-2.5 text-white shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.08em]">
          <span className="h-2 w-2 animate-pulse rounded-full bg-white" aria-hidden="true" />
          En direct
        </span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{live.title}</span>
        {viewers > 0 && (
          <span className="flex shrink-0 items-center gap-1 text-[13px] opacity-90" aria-label={`${viewers} agents suivent`}>
            <Eye size={14} strokeWidth={2} aria-hidden="true" />
            {viewers}
          </span>
        )}
        <ChevronRight size={18} strokeWidth={2} className="shrink-0 opacity-90" aria-hidden="true" />
      </Link>
    </div>
  );
}
