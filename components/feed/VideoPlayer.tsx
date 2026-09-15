"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Captions, CaptionsOff, Maximize2, Play, Volume2, VolumeX } from "lucide-react";
import type { MediaItem } from "@/lib/feed/types";
import { mediaUrl, posterSrc, videoSrc } from "@/lib/media/url";
import { cn } from "@/lib/cn";

const SPEEDS = [1, 1.25, 1.5] as const;
const MILESTONES = [25, 50, 75, 100] as const;

type IOSVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void; webkitSupportsFullscreen?: boolean };

function resumeKey(id: string) {
  return `atlas:video:${id}`;
}

/**
 * Lecteur vidéo : HLS (hls.js, natif sur Safari) avec repli MP4, lecture au tap,
 * muet par défaut avec bouton son visible, sous-titres activés quand le son est
 * coupé, plein écran natif, reprise à la position, vitesse 1× / 1,25× / 1,5×,
 * cadre selon l'orientation (jamais de bandes ajoutées), paliers 25/50/75/100.
 */
export function VideoPlayer({
  media,
  controls = false,
  autoplay = true,
  onDoubleTap,
  onProgress,
  rounded = true,
}: {
  media: MediaItem;
  controls?: boolean;
  autoplay?: boolean;
  onDoubleTap?: () => void;
  /** Palier atteint (25, 50, 75, 100), une fois chacun par montage */
  onProgress?: (pct: number) => void;
  rounded?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [started, setStarted] = useState(false);
  const reached = useRef(new Set<number>());
  const hlsUrl = media.hls_key && media.video_status === "ready" ? mediaUrl(media.hls_key) : null;
  const subtitlesUrl = media.subtitles_key ? mediaUrl(media.subtitles_key) : null;

  // Source : hls.js, HLS natif (iPhone), sinon MP4
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    let hls: { destroy: () => void } | null = null;
    let cancelled = false;
    const mp4 = videoSrc(media);
    if (!hlsUrl) {
      v.src = mp4;
      return;
    }
    // hls.js dès que MSE existe (Chrome, Firefox, Safari macOS) ; natif sinon (iPhone) ; MP4 en dernier recours.
    // Chrome en émulation mobile répond « maybe » au HLS natif sans savoir le lire : on ne s'y fie pas.
    import("hls.js").then(({ default: Hls }) => {
      if (cancelled) return;
      if (!Hls.isSupported()) {
        v.src = v.canPlayType("application/vnd.apple.mpegurl") ? hlsUrl : mp4;
        return;
      }
      const h = new Hls({ maxBufferLength: 20, startLevel: -1, capLevelToPlayerSize: true });
      h.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          console.warn("hls", data.type, data.details);
          const wasPlaying = !v.paused;
          h.destroy();
          v.src = mp4;
          if (wasPlaying || autoplay) v.play().catch(() => {});
        }
      });
      h.loadSource(hlsUrl);
      h.attachMedia(v);
      hls = h;
    });
    return () => {
      cancelled = true;
      hls?.destroy();
    };
  }, [hlsUrl, media, autoplay]);

  // Lecture automatique muette quand visible, pause hors écran
  useEffect(() => {
    const v = ref.current;
    if (!v || !autoplay) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio >= 0.6) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: [0, 0.6] },
    );
    io.observe(v);
    return () => io.disconnect();
  }, [autoplay]);

  // Reprise à la position (au-delà de 3 s, avant la fin)
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const onMeta = () => {
      try {
        const saved = Number(localStorage.getItem(resumeKey(media.id)));
        if (saved > 3 && v.duration && saved < v.duration - 2) v.currentTime = saved;
      } catch {}
    };
    v.addEventListener("loadedmetadata", onMeta);
    return () => v.removeEventListener("loadedmetadata", onMeta);
  }, [media.id]);

  // Sous-titres : suivent le son (activés quand muet), puis le choix de l'agent
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const track = v.textTracks?.[0];
    if (track) track.mode = subtitlesUrl && captionsOn ? "showing" : "hidden";
  }, [captionsOn, subtitlesUrl, hlsUrl]);

  const onTime = useCallback(() => {
    const v = ref.current;
    if (!v || !v.duration) return;
    try {
      localStorage.setItem(resumeKey(media.id), String(Math.floor(v.currentTime)));
    } catch {}
    const pct = (v.currentTime / v.duration) * 100;
    for (const m of MILESTONES) {
      if (pct >= m - 0.5 && !reached.current.has(m)) {
        reached.current.add(m);
        onProgress?.(m);
      }
    }
  }, [media.id, onProgress]);

  function toggle() {
    const v = ref.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }

  function fullscreen(e: React.MouseEvent) {
    e.stopPropagation();
    const v = ref.current as IOSVideo | null;
    if (!v) return;
    if (v.requestFullscreen) v.requestFullscreen().catch(() => v.webkitEnterFullscreen?.());
    else v.webkitEnterFullscreen?.();
  }

  const ratio = media.width && media.height ? media.width / media.height : media.orientation === "portrait" ? 9 / 16 : 16 / 9;
  // Portrait : cadre 4:5 dans le fil (la vidéo remplit sans bandes), plein en page ; paysage : ratio natif
  const frame = controls ? Math.min(Math.max(ratio, 0.5625), 1.91) : ratio < 1 ? Math.max(ratio, 0.8) : Math.min(ratio, 1.91);

  return (
    <div className={cn("group relative overflow-hidden bg-bg-1", rounded && "rounded-[28px]")} style={{ aspectRatio: String(frame) }}>
      <video
        ref={ref}
        poster={posterSrc(media)}
        muted={muted}
        playsInline
        loop={!controls}
        preload="metadata"
        crossOrigin="anonymous"
        aria-label={media.alt || "Vidéo"}
        onPlay={() => {
          setPlaying(true);
          setStarted(true);
        }}
        onPause={() => setPlaying(false)}
        onTimeUpdate={onTime}
        onEnded={() => {
          reached.current.add(100);
          onProgress?.(100);
          try {
            localStorage.removeItem(resumeKey(media.id));
          } catch {}
        }}
        onClick={toggle}
        onDoubleClick={onDoubleTap}
        onRateChange={(e) => setSpeed((SPEEDS.find((s) => s === e.currentTarget.playbackRate) ?? 1) as (typeof SPEEDS)[number])}
        className={cn("h-full w-full", ratio < 1 && !controls ? "object-cover" : "object-contain")}
      >
        {subtitlesUrl && <track kind="subtitles" srcLang="fr" label="Français" src={subtitlesUrl} default />}
      </video>

      {!playing && (
        <button type="button" onClick={toggle} aria-label="Lire" className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/45 text-white">
            <Play size={24} strokeWidth={1.75} fill="currentColor" className="ml-0.5" />
          </span>
        </button>
      )}

      <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
        {controls && started && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
              if (ref.current) ref.current.playbackRate = next;
              setSpeed(next);
            }}
            aria-label={`Vitesse ${speed}×`}
            className="flex h-9 min-w-9 items-center justify-center rounded-full bg-black/45 px-2 text-[12px] font-semibold tabular-nums text-white/90"
          >
            {String(speed).replace(".", ",")}×
          </button>
        )}
        {subtitlesUrl && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setCaptionsOn((c) => !c);
            }}
            aria-label={captionsOn ? "Masquer les sous-titres" : "Afficher les sous-titres"}
            aria-pressed={captionsOn}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white/90"
          >
            {captionsOn ? <Captions size={18} strokeWidth={1.75} /> : <CaptionsOff size={18} strokeWidth={1.75} />}
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMuted((m) => {
              const next = !m;
              if (!next) setCaptionsOn(false);
              else setCaptionsOn(true);
              return next;
            });
          }}
          aria-label={muted ? "Activer le son" : "Couper le son"}
          aria-pressed={!muted}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white/90"
        >
          {muted ? <VolumeX size={18} strokeWidth={1.75} /> : <Volume2 size={18} strokeWidth={1.75} />}
        </button>
        <button type="button" onClick={fullscreen} aria-label="Plein écran" className="flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white/90">
          <Maximize2 size={18} strokeWidth={1.75} />
        </button>
      </div>
      {media.video_status === "processing" && <span className="absolute left-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white/90">Qualité en cours d&apos;optimisation</span>}
    </div>
  );
}
