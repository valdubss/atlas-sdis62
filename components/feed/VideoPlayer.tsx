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

/** Lecteur en cours de lecture automatique dans le fil : un seul à la fois. */
let activeVideo: HTMLVideoElement | null = null;

/**
 * Lecteur vidéo : HLS (hls.js, natif sur Safari) avec repli MP4, lecture au tap,
 * muet par défaut avec bouton son visible, sous-titres activés quand le son est
 * coupé, plein écran natif, reprise à la position, vitesse 1× / 1,25× / 1,5×,
 * cadre selon l'orientation (jamais de bandes ajoutées), paliers 25/50/75/100.
 */
/** Vidéo encodée en ligne (Bunny Stream) pas encore lisible : URL absolue et état non prêt. */
function isProcessingRemote(m: MediaItem) {
  return m.kind === "video" && /^https?:/.test(m.original_key ?? "") && m.video_status !== "ready";
}

/** Suit l'état d'une vidéo en cours d'encodage en ligne (sondage toutes les 6 s, 12 min au plus). */
function useLiveMedia(initial: MediaItem): MediaItem {
  const [live, setLive] = useState(initial);
  // Nouveau média reçu du serveur (rafraîchissement du fil) : on repart de sa version
  const [source, setSource] = useState(initial);
  if (source !== initial) {
    setSource(initial);
    setLive(initial);
  }
  const id = live.id;
  const status = live.video_status;
  const remote = isProcessingRemote(live);
  useEffect(() => {
    if (!remote || status === "failed") return;
    let alive = true;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      if (!alive) return;
      try {
        const res = await fetch(`/api/video/status?id=${id}`, { cache: "no-store" });
        if (res.ok) {
          const s = (await res.json()) as Partial<MediaItem>;
          if (!alive) return;
          if (s.video_status) setLive((m) => ({ ...m, ...s }));
          if (s.video_status === "ready" || s.video_status === "failed") return;
        }
      } catch {
        /* réseau : on réessaie */
      }
      if (++tries < 120 && alive) timer = setTimeout(tick, 6000);
    };
    timer = setTimeout(tick, 4000);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [id, status, remote]);
  return live;
}

export function VideoPlayer({
  media: initial,
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
  const media = useLiveMedia(initial);
  const processing = isProcessingRemote(media);
  const [muted, setMuted] = useState(true);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [started, setStarted] = useState(false);
  // Première image décodée : le poster peut s'effacer
  const [firstFrame, setFirstFrame] = useState(false);
  const reached = useRef(new Set<number>());
  const hlsUrl = media.hls_key && media.video_status === "ready" ? mediaUrl(media.hls_key) : null;
  const subtitlesUrl = media.subtitles_key ? mediaUrl(media.subtitles_key) : null;

  // Source chargée seulement à l'approche de l'écran (un écran et demi) : le fil reste léger
  const [near, setNear] = useState(!autoplay);
  useEffect(() => {
    const v = ref.current;
    if (!v || near) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "150% 0px" },
    );
    io.observe(v);
    return () => io.disconnect();
  }, [near]);

  // Source : hls.js, HLS natif (iPhone), sinon MP4
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    let hls: { destroy: () => void } | null = null;
    let cancelled = false;
    const mp4 = videoSrc(media);
    if (processing || !near) return; // rien à charger tant que l'encodage n'est pas fini ou que la carte est loin
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
  }, [hlsUrl, media, autoplay, processing, near]);

  // Lecture automatique muette quand visible, pause hors écran ; un seul lecteur actif à la fois
  useEffect(() => {
    const v = ref.current;
    if (!v || !autoplay) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio >= 0.6) {
          if (activeVideo && activeVideo !== v && !activeVideo.paused) activeVideo.pause();
          activeVideo = v;
          v.play().catch(() => {});
        } else {
          v.pause();
          if (activeVideo === v) activeVideo = null;
        }
      },
      { threshold: [0, 0.6] },
    );
    io.observe(v);
    return () => {
      io.disconnect();
      if (activeVideo === v) activeVideo = null;
    };
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
        onPlaying={() => setFirstFrame(true)}
        onLoadedData={() => setFirstFrame(true)}
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

      {/* Poster maintenu par-dessus la vidéo tant qu'aucune image n'est décodée : pas d'éclair noir à l'arrivée sur le fil */}
      {posterSrc(media) && !firstFrame && !processing && (
        // eslint-disable-next-line @next/next/no-img-element -- poster déjà optimisé
        <img src={posterSrc(media)} alt="" aria-hidden="true" className={cn("pointer-events-none absolute inset-0 h-full w-full", ratio < 1 && !controls ? "object-cover" : "object-contain")} />
      )}

      {processing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 text-white" aria-live="polite">
          {media.video_status !== "failed" && <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />}
          <p className="text-[14px] font-medium">{media.video_status === "failed" ? "Vidéo indisponible" : "Vidéo en cours de traitement…"}</p>
        </div>
      )}

      {!playing && !processing && (
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
