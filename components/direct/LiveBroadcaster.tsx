"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Radio, RefreshCw, Square } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";

type State = "idle" | "preview" | "connecting" | "live" | "error";

/**
 * Diffusion vidéo depuis le téléphone, dans l'app : caméra et micro, aperçu, puis envoi par
 * WebRTC (WHIP) à Cloudflare Stream. Caméra arrière par défaut, bascule avant/arrière, micro
 * coupable, écran maintenu allumé pendant la diffusion. Arrêt propre (DELETE WHIP).
 */
export function LiveBroadcaster({ whipUrl }: { whipUrl: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const resourceRef = useRef<string | null>(null);
  const wakeRef = useRef<{ release: () => Promise<void> } | null>(null);
  const [state, setState] = useState<State>("idle");
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [micOn, setMicOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const toast = useToast();

  useEffect(() => {
    if (state !== "live") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [state]);

  useEffect(() => () => void stopAll(), []); // eslint-disable-line react-hooks/exhaustive-deps -- nettoyage au démontage

  async function openCamera(mode: "environment" | "user") {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
    stream.getAudioTracks().forEach((t) => (t.enabled = micOn));
    return stream;
  }

  async function preview() {
    setError(null);
    try {
      await openCamera(facing);
      setState("preview");
    } catch (e) {
      setError(e instanceof Error && /NotAllowed|Permission/i.test(e.message) ? "Accès à la caméra refusé : autorisez ATLAS dans les réglages du téléphone." : "Caméra indisponible sur cet appareil.");
      setState("error");
    }
  }

  async function switchCamera() {
    const next = facing === "environment" ? "user" : "environment";
    setFacing(next);
    try {
      const stream = await openCamera(next);
      const pc = pcRef.current;
      if (pc) {
        const v = stream.getVideoTracks()[0];
        const a = stream.getAudioTracks()[0];
        for (const sender of pc.getSenders()) {
          if (sender.track?.kind === "video" && v) await sender.replaceTrack(v);
          if (sender.track?.kind === "audio" && a) await sender.replaceTrack(a);
        }
      }
    } catch {
      toast("Bascule de caméra impossible.");
    }
  }

  function toggleMic() {
    const next = !micOn;
    setMicOn(next);
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = next));
  }

  async function start() {
    const stream = streamRef.current ?? (await openCamera(facing).catch(() => null));
    if (!stream) return preview();
    setState("connecting");
    setError(null);
    try {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }], bundlePolicy: "max-bundle" });
      pcRef.current = pc;
      for (const track of stream.getTracks()) {
        const tx = pc.addTransceiver(track, { direction: "sendonly", streams: [stream] });
        if (track.kind === "video" && "setCodecPreferences" in tx) {
          const caps = RTCRtpSender.getCapabilities?.("video");
          const h264 = caps?.codecs.filter((c) => /H264/i.test(c.mimeType)) ?? [];
          if (h264.length) tx.setCodecPreferences([...h264, ...(caps?.codecs.filter((c) => !/H264/i.test(c.mimeType)) ?? [])]);
        }
      }
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") setState("live");
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          setError("Connexion perdue : vérifiez le réseau puis relancez.");
          setState("error");
        }
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      // Offre complète (sans trickle) : on attend la fin de la collecte ICE, 2 s au plus
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === "complete") return resolve();
        const t = setTimeout(resolve, 2000);
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === "complete") {
            clearTimeout(t);
            resolve();
          }
        };
      });
      const res = await fetch(whipUrl, { method: "POST", headers: { "content-type": "application/sdp" }, body: pc.localDescription?.sdp ?? "" });
      if (!res.ok) throw new Error(`Le service de diffusion a refusé la connexion (${res.status}).`);
      resourceRef.current = res.headers.get("location");
      await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });
      setSeconds(0);
      try {
        wakeRef.current = await (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen") ?? null;
      } catch {
        /* veille non verrouillable */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Diffusion impossible.");
      setState("error");
      pcRef.current?.close();
      pcRef.current = null;
    }
  }

  async function stopAll() {
    const resource = resourceRef.current;
    resourceRef.current = null;
    if (resource) {
      try {
        await fetch(new URL(resource, whipUrl).toString(), { method: "DELETE", keepalive: true });
      } catch {
        /* le serveur coupe de lui-même après quelques secondes */
      }
    }
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    wakeRef.current?.release().catch(() => {});
    wakeRef.current = null;
  }

  async function stop() {
    await stopAll();
    setState("idle");
    toast("Diffusion arrêtée");
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <section className="space-y-3 rounded-[16px] bg-bg-1 p-4" aria-label="Diffuser depuis le téléphone">
      <p className="text-[13px] font-semibold text-text-2">Diffuser depuis ce téléphone</p>
      <div className="relative aspect-video overflow-hidden rounded-[12px] bg-black">
        <video ref={videoRef} muted playsInline autoPlay className={cn("h-full w-full object-cover", state === "idle" && "hidden")} />
        {state === "idle" && (
          <button type="button" onClick={preview} className="pressable flex h-full w-full flex-col items-center justify-center gap-2 text-white">
            <Radio size={28} strokeWidth={1.75} aria-hidden="true" />
            <span className="text-[15px] font-semibold">Ouvrir la caméra</span>
          </button>
        )}
        {state === "live" && (
          <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-red-fill px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" aria-hidden="true" />
            En direct · {mm}:{ss}
          </span>
        )}
        {state === "connecting" && <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-white">Connexion…</span>}
        {state !== "idle" && (
          <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
            <button type="button" onClick={toggleMic} aria-label={micOn ? "Couper le micro" : "Activer le micro"} className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white">
              {micOn ? <Mic size={18} strokeWidth={1.75} aria-hidden="true" /> : <MicOff size={18} strokeWidth={1.75} aria-hidden="true" />}
            </button>
            <button type="button" onClick={switchCamera} aria-label="Changer de caméra" className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white">
              <RefreshCw size={18} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      {error && <p className="text-[13px] text-red-text">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {(state === "preview" || state === "error") && (
          <button type="button" onClick={start} className="pressable inline-flex h-11 items-center gap-2 rounded-[12px] bg-red-fill px-4 text-[15px] font-semibold text-white">
            <Radio size={18} strokeWidth={2} aria-hidden="true" /> Démarrer la diffusion
          </button>
        )}
        {(state === "live" || state === "connecting") && (
          <button type="button" onClick={stop} className="pressable inline-flex h-11 items-center gap-2 rounded-[12px] bg-bg-2 px-4 text-[15px] font-semibold text-text-1">
            <Square size={18} strokeWidth={2} aria-hidden="true" /> Arrêter la diffusion
          </button>
        )}
        <span className="text-[13px] text-text-3">{state === "live" ? "Les agents voient la vidéo avec moins d'une seconde de retard. Gardez l'app ouverte." : "Tenez le téléphone à l'horizontale, en 4G ou Wi-Fi."}</span>
      </div>
    </section>
  );
}
