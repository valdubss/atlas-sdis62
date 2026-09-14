"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import type { FeedPost } from "@/lib/feed/types";
import { formatDateTime } from "@/lib/format";
import { FEED_CACHE_KEY } from "./FeedCache";
import { PostCard } from "./PostCard";

/** Dernières publications enregistrées sur l'appareil, en lecture seule. */
export function OfflineFeed() {
  const [data, setData] = useState<{ at: number; posts: FeedPost[] } | null | undefined>(undefined);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FEED_CACHE_KEY);
      setData(raw ? (JSON.parse(raw) as { at: number; posts: FeedPost[] }) : null);
    } catch {
      setData(null);
    }
    const back = () => window.location.replace("/");
    window.addEventListener("online", back);
    return () => window.removeEventListener("online", back);
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-[16px] bg-bg-1 px-4 py-3">
        <WifiOff size={20} strokeWidth={1.75} className="shrink-0 text-text-2" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium text-text-1">Vous êtes hors ligne</p>
          <p className="text-[13px] text-text-3">
            {data ? `Publications enregistrées le ${formatDateTime(new Date(data.at).toISOString())}.` : "Aucune publication enregistrée sur cet appareil."}
          </p>
        </div>
        <button type="button" onClick={() => window.location.replace("/")} className="pressable shrink-0 rounded-[10px] bg-bg-2 px-3 py-2 text-[13px] font-medium text-text-1">
          Réessayer
        </button>
      </div>
      {data?.posts.map((p) => (
        <PostCard key={p.id} post={p} preview />
      ))}
      {data === null && <p className="px-2 text-[15px] text-text-2">Ouvrez le fil une fois connecté : il restera consultable ici sans réseau.</p>}
    </div>
  );
}
