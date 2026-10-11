"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, Volume2, VolumeX } from "lucide-react";
import { LIVE_HLS_URL } from "@/lib/direct/types";
import { cn } from "@/lib/cn";

type IOSVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };

/**
 * Lecteur du direct vidéo (HLS Bunny Stream) : muet par défaut, bouton son, plein écran,
 * pastille « EN DIRECT ». Tant que le flux n'a pas démarré (playlist absente), un message
 * d'attente s'affiche et le lecteur réessaie toutes les dix secondes.
 */
export function LivePlayer({ active, compact = false }: { active: boolean; compact?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [waiting, setWaiting] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const url = LIVE_HLS_URL;

  useEffect(() => {
    const v = ref.current;
    if (!v || !url || !active) return;
    let hls: { destroy: () => void } | null = null;
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const scheduleRetry = () => {
      if (cancelled) return;
      setWaiting(true);
      retry = setTimeout(() => setAttempt((n) => n + 1), 10_000);
    };
    const onPlaying = () => setWaiting(false);
    v.addEventListener("playing", onPlaying);
    import("hls.js").then(({ default: Hls }) => {
      if (cancelled) return;
      if (!Hls.isSupported()) {
        if (!v.canPlayType("application/vnd.apple.mpegurl")) return scheduleRetry();
        v.src = url;
        v.onerror = scheduleRetry;
        v.play().catch(() => {});
        return;
      }
      const h = new Hls({ liveSyncDurationCount: 3, maxBufferLength: 12, lowLatencyMode: true, capLevelToPlayerSize: true });
      h.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          h.destroy();
          hls = null;
          scheduleRetry();
        }
      });
      h.on(Hls.Events.MANIFEST_PARSED, () => v.play().catch(() => {}));
      h.loadSource(url);
      h.attachMedia(v);
      hls = h;
    });
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
      v.removeEventListener("playing", onPlaying);
      hls?.destroy();
    };
  }, [url, active, attempt]);

  function fullscreen() {
    const v = ref.current as IOSVideo | null;
    if (!v) return;
    if (v.requestFullscreen) v.requestFullscreen().catch(() => v.webkitEnterFullscreen?.());
    else v.webkitEnterFullscreen?.();
  }

  if (!url) {
    return <div className="flex aspect-video items-center justify-center rounded-[16px] bg-bg-2 text-[13px] text-text-3">Diffusion vidéo non configurée.</div>;
  }

  return (
    <div className={cn("relative overflow-hidden bg-black", compact ? "aspect-video" : "aspect-video sm:rounded-[16px]")}>
      <video ref={ref} muted={muted} playsInline autoPlay preload="none" aria-label="Vidéo en direct" className="h-full w-full object-contain" />
      <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-red-fill px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-white">
        <span className="h-2 w-2 animate-pulse rounded-full bg-white" aria-hidden="true" />
        {active ? "En direct" : "Terminé"}
      </span>
      {waiting && active && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-white" aria-live="polite">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
          <p className="text-[14px] font-medium">En attente du flux vidéo…</p>
        </div>
      )}
      {!active && <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-[14px] font-medium text-white">Le direct vidéo est terminé.</div>}
      <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
        <button type="button" onClick={() => setMuted((m) => !m)} aria-label={muted ? "Activer le son" : "Couper le son"} className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white">
          {muted ? <VolumeX size={18} strokeWidth={1.75} aria-hidden="true" /> : <Volume2 size={18} strokeWidth={1.75} aria-hidden="true" />}
        </button>
        <button type="button" onClick={fullscreen} aria-label="Plein écran" className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white">
          <Maximize2 size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
