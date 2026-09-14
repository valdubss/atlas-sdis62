"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Volume2, VolumeX } from "lucide-react";
import type { MediaItem } from "@/lib/feed/types";
import { posterSrc, videoSrc } from "@/lib/media/url";
import { cn } from "@/lib/cn";

/**
 * Lecteur vidéo : coins 28 px, lecture automatique muette quand visible, pause hors
 * écran, tap = lecture/pause, bouton son discret, contrôles natifs en page de lecture.
 */
export function VideoPlayer({
  media,
  controls = false,
  autoplay = true,
  onDoubleTap,
  rounded = true,
}: {
  media: MediaItem;
  controls?: boolean;
  autoplay?: boolean;
  onDoubleTap?: () => void;
  rounded?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);

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

  const ratio = media.width && media.height ? Math.min(Math.max(media.width / media.height, 0.56), 1.91) : 16 / 9;

  return (
    <div className={cn("relative overflow-hidden bg-bg-1", rounded && "rounded-[28px]")} style={{ aspectRatio: String(ratio) }}>
      <video
        ref={ref}
        src={videoSrc(media)}
        poster={posterSrc(media)}
        muted={muted}
        playsInline
        loop
        preload="metadata"
        controls={controls}
        aria-label={media.alt || "Vidéo"}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onClick={() => {
          if (controls) return;
          const v = ref.current;
          if (!v) return;
          if (v.paused) v.play().catch(() => {});
          else v.pause();
        }}
        onDoubleClick={onDoubleTap}
        className="h-full w-full object-cover"
      />
      {!controls && !playing && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/45 text-white">
            <Play size={24} strokeWidth={1.75} fill="currentColor" className="ml-0.5" />
          </span>
        </span>
      )}
      {!controls && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMuted((m) => !m);
          }}
          aria-label={muted ? "Activer le son" : "Couper le son"}
          aria-pressed={!muted}
          className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white/90"
        >
          {muted ? <VolumeX size={18} strokeWidth={1.75} /> : <Volume2 size={18} strokeWidth={1.75} />}
        </button>
      )}
    </div>
  );
}
