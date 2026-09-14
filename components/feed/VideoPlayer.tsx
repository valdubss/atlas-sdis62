"use client";

import { useEffect, useRef, useState } from "react";
import type { MediaItem } from "@/lib/feed/types";
import { posterSrc, videoSrc } from "@/lib/media/url";
import { cn } from "@/lib/cn";

/**
 * Lecteur vidéo façon Instagram : lecture automatique muette quand la vidéo est
 * visible, pause hors écran, tap = lecture/pause, bouton son, contrôles natifs
 * en page de lecture.
 */
export function VideoPlayer({
  media,
  controls = false,
  autoplay = true,
  onDoubleTap,
}: {
  media: MediaItem;
  controls?: boolean;
  autoplay?: boolean;
  onDoubleTap?: () => void;
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
    <div className="relative select-none bg-black" style={{ aspectRatio: String(ratio) }}>
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
        className="h-full w-full object-contain"
      />
      {!controls && !playing && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/55 text-white">
            <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7" fill="currentColor"><path d="M7 5v14l12-7z" /></svg>
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
          className={cn("absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white")}
        >
          {muted ? (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 9v6h4l5 4V5L8 9H4zm12 2 4 4m0-4-4 4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 9v6h4l5 4V5L8 9H4zm12-1a5 5 0 0 1 0 8m2.5-11a9 9 0 0 1 0 14" strokeLinecap="round" strokeLinejoin="round" /></svg>
          )}
        </button>
      )}
    </div>
  );
}
