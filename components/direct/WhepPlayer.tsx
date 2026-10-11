"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/cn";

type IOSVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void };

/**
 * Lecteur du direct vidéo en WebRTC (WHEP, Cloudflare Stream) : latence inférieure à la
 * seconde, muet par défaut, son et plein écran. Tant que personne ne diffuse, « En attente du
 * flux » et nouvel essai toutes les dix secondes.
 */
export function WhepPlayer({ whepUrl, active, compact = false, lazy = false }: { whepUrl: string; active: boolean; compact?: boolean; lazy?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [enabled, setEnabled] = useState(!lazy);
  const [muted, setMuted] = useState(true);
  const [waiting, setWaiting] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const v = ref.current;
    if (!v || !active || !whepUrl || !enabled) return;
    let cancelled = false;
    let pc: RTCPeerConnection | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let resource: string | null = null;
    const scheduleRetry = () => {
      if (cancelled) return;
      setWaiting(true);
      pc?.close();
      pc = null;
      retry = setTimeout(() => setAttempt((n) => n + 1), 10_000);
    };
    (async () => {
      try {
        pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }], bundlePolicy: "max-bundle" });
        pc.addTransceiver("video", { direction: "recvonly" });
        pc.addTransceiver("audio", { direction: "recvonly" });
        const stream = new MediaStream();
        pc.ontrack = (e) => {
          stream.addTrack(e.track);
          if (v.srcObject !== stream) v.srcObject = stream;
          v.play().catch(() => {});
        };
        pc.onconnectionstatechange = () => {
          if (pc?.connectionState === "failed" || pc?.connectionState === "disconnected") scheduleRetry();
        };
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await new Promise<void>((resolve) => {
          if (pc!.iceGatheringState === "complete") return resolve();
          const t = setTimeout(resolve, 2000);
          pc!.onicegatheringstatechange = () => {
            if (pc!.iceGatheringState === "complete") {
              clearTimeout(t);
              resolve();
            }
          };
        });
        const res = await fetch(whepUrl, { method: "POST", headers: { "content-type": "application/sdp" }, body: pc.localDescription?.sdp ?? "" });
        if (!res.ok || cancelled) return scheduleRetry();
        resource = res.headers.get("location");
        await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });
      } catch {
        scheduleRetry();
      }
    })();
    const onPlaying = () => setWaiting(false);
    v.addEventListener("playing", onPlaying);
    return () => {
      cancelled = true;
      if (retry) clearTimeout(retry);
      v.removeEventListener("playing", onPlaying);
      if (resource) fetch(new URL(resource, whepUrl).toString(), { method: "DELETE", keepalive: true }).catch(() => {});
      pc?.close();
    };
  }, [whepUrl, active, attempt, enabled]);

  function fullscreen() {
    const v = ref.current as IOSVideo | null;
    if (!v) return;
    if (v.requestFullscreen) v.requestFullscreen().catch(() => v.webkitEnterFullscreen?.());
    else v.webkitEnterFullscreen?.();
  }

  return (
    <div className={cn("relative overflow-hidden bg-black", compact ? "aspect-video" : "aspect-video sm:rounded-[16px]")}>
      <video ref={ref} muted={muted} playsInline autoPlay aria-label="Vidéo en direct" className="h-full w-full object-contain" />
      <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-red-fill px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-white">
        <span className="h-2 w-2 animate-pulse rounded-full bg-white" aria-hidden="true" />
        {active ? "En direct" : "Terminé"}
      </span>
      {!enabled && active && (
        <button type="button" onClick={() => setEnabled(true)} className="pressable absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60 text-white">
          <span className="text-[14px] font-semibold">Voir ce que reçoivent les agents</span>
          <span className="text-[12px] text-white/70">Inutile pendant que vous diffusez depuis ce téléphone</span>
        </button>
      )}
      {waiting && active && enabled && (
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
