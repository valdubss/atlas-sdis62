"use client";

import { useEffect } from "react";
import { installUnloadGuard, useUploadQueue } from "@/lib/media/queue";

/** Bandeau des envois en cours (studio), au-dessus de la barre basse sur mobile. */
export function UploadQueue() {
  const items = useUploadQueue();
  useEffect(() => installUnloadGuard(), []);
  const active = items.filter((i) => i.status !== "ready");
  if (active.length === 0) return null;
  const overall = active.reduce((n, i) => n + (i.status === "error" ? 1 : i.progress), 0) / active.length;
  return (
    <div role="status" aria-live="polite" className="glass-float fixed inset-x-4 bottom-[calc(max(env(safe-area-inset-bottom),12px)+72px)] z-30 mx-auto max-w-[560px] rounded-[16px] px-4 py-2.5 md:bottom-4 md:left-auto md:right-6 md:w-[360px]">
      <div className="flex items-center justify-between gap-3 text-[13px]">
        <span className="min-w-0 truncate text-text-1">
          {active.length === 1 ? active[0].name : `${active.length} envois`}
          <span className="text-text-3"> · {active.some((i) => i.status === "error") ? "une erreur" : active.every((i) => i.status === "processing") ? "traitement" : `${Math.round(overall * 100)} %`}</span>
        </span>
        <span className="shrink-0 text-text-3">{active.filter((i) => i.status === "uploading").length > 0 ? "Envoi en arrière-plan" : ""}</span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-text-1 transition-[width]" style={{ width: `${Math.round(overall * 100)}%` }} />
      </div>
    </div>
  );
}
