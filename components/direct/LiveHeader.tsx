"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { LiveItem } from "@/lib/direct/types";
import { useLiveViewers } from "./useLiveViewers";

/** État du Direct sur sa page : pastille, nombre d'agents présents (présence), rafraîchissement à la clôture. */
export function LiveHeader({ live, userId }: { live: LiveItem; userId: string }) {
  const [status, setStatus] = useState(live.status);
  const viewers = useLiveViewers(status === "live" ? live.id : null, userId, true);
  const router = useRouter();

  useEffect(() => setStatus(live.status), [live.status]);
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`live-page:${live.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "lives", filter: `id=eq.${live.id}` }, (payload) => {
        const next = (payload.new as { status?: LiveItem["status"] }).status;
        if (next && next !== status) {
          setStatus(next);
          router.refresh();
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [live.id, status, router]);

  return (
    <div className="flex items-center gap-3 px-1" aria-live="polite">
      {status === "live" ? (
        <span className="flex items-center gap-1.5 rounded-full bg-red-fill px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-white">
          <span className="h-2 w-2 animate-pulse rounded-full bg-white" aria-hidden="true" />
          En direct
        </span>
      ) : (
        <span className="rounded-full bg-bg-2 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-text-2">{status === "ended" ? "Terminé" : "Brouillon"}</span>
      )}
      {status === "live" && (
        <span className="flex items-center gap-1 text-[13px] text-text-2">
          <Eye size={14} strokeWidth={2} aria-hidden="true" />
          {viewers <= 1 ? "Vous suivez ce direct" : `${viewers} agents suivent`}
        </span>
      )}
    </div>
  );
}
