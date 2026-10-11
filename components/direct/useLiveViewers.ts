"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Nombre d'agents en train de suivre un Direct : présence Supabase Realtime sur le canal
 * `live:<id>` (une clé par agent, plusieurs onglets comptent une fois).
 */
export function useLiveViewers(liveId: string | null, userId: string | null, track = true): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!liveId) return;
    const supabase = createClient();
    const channel = supabase.channel(`live:${liveId}`, { config: { presence: { key: userId ?? `anon-${Math.random().toString(36).slice(2)}` } } });
    channel
      .on("presence", { event: "sync" }, () => setCount(Object.keys(channel.presenceState()).length))
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED" && track) await channel.track({ at: Date.now() });
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [liveId, userId, track]);
  return count;
}
