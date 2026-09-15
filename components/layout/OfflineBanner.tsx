"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { isOnline, offlineQueue } from "@/lib/offline/queue";
import { setReaction } from "@/app/(app)/feed-actions";
import { sendMessage } from "@/app/(app)/messages/actions";
import type { ReactionKind } from "@/lib/config";

/**
 * Bandeau « Hors ligne » sous la barre haute et rejeu de la file d'envoi
 * différé (réactions, messages) au retour du réseau.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [queued, setQueued] = useState(0);

  useEffect(() => {
    const refresh = () => {
      setOffline(!isOnline());
      setQueued(offlineQueue.size());
    };
    refresh();
    const flush = () =>
      offlineQueue
        .flush(async (op) => {
          if (!isOnline()) return "retry";
          if (op.kind === "reaction") {
            const r = await setReaction(op.post_id, op.reaction as ReactionKind | null);
            return r.ok ? "done" : r.error.includes("réseau") ? "retry" : "drop";
          }
          const r = await sendMessage({ channel_id: op.channel_id, body: op.body ?? undefined, reply_to_id: op.reply_to_id, mentions: op.mentions, mention_all: op.mention_all, client_id: op.client_id });
          return r.ok ? "done" : r.error.includes("réseau") ? "retry" : "drop";
        })
        .then(refresh)
        .catch(refresh);
    const onOnline = () => {
      refresh();
      flush();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", refresh);
    const unsub = offlineQueue.subscribe(refresh);
    if (isOnline() && offlineQueue.size() > 0) flush();
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", refresh);
      unsub();
    };
  }, []);

  if (!offline && queued === 0) return null;
  return (
    <div role="status" className="fixed inset-x-4 top-[calc(48px+env(safe-area-inset-top)+6px)] z-20 mx-auto flex max-w-[560px] items-center gap-2 rounded-full bg-bg-2 px-4 py-2 text-[13px] text-text-1 shadow-[var(--shadow-float)]">
      <WifiOff size={16} strokeWidth={1.75} className="shrink-0 text-text-2" aria-hidden="true" />
      {offline ? "Hors ligne : lecture seule" : "Reconnexion…"}
      {queued > 0 && <span className="text-text-3"> · {queued} envoi{queued > 1 ? "s" : ""} en attente</span>}
    </div>
  );
}
