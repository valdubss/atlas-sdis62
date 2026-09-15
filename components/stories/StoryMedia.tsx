"use client";

import type { RefObject } from "react";
import type { MediaItem, StoryOverlay } from "@/lib/feed/types";
import { imageSrc, posterSrc, videoSrc } from "@/lib/media/url";
import { cn } from "@/lib/cn";

/**
 * Média d'une story en 9:16 sur fond noir pur (seul endroit où le #000 est
 * autorisé), texte superposé avec ombre, jamais de bandeau opaque.
 */
export function StoryMedia({
  media,
  overlay,
  videoRef,
  muted = true,
  playing = true,
  onVideoTime,
  onVideoEnded,
  fit = "cover",
}: {
  media: MediaItem | null;
  overlay: StoryOverlay;
  videoRef?: RefObject<HTMLVideoElement | null>;
  muted?: boolean;
  playing?: boolean;
  onVideoTime?: (fraction: number) => void;
  onVideoEnded?: () => void;
  fit?: "cover" | "contain";
}) {
  const position = overlay?.position ?? "bottom";
  // Média plus large que haut : affiché entier (bandes noires) au lieu d'être rogné
  const landscape = Boolean(media?.width && media?.height && media.width > media.height);
  const fitClass = fit === "contain" || landscape ? "object-contain" : "object-cover";
  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-black">
      {media?.kind === "video" ? (
        <video
          ref={videoRef}
          src={videoSrc(media)}
          poster={posterSrc(media)}
          muted={muted}
          autoPlay={playing}
          playsInline
          preload="auto"
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (v.duration > 0) onVideoTime?.(v.currentTime / v.duration);
          }}
          onEnded={onVideoEnded}
          className={cn("h-full w-full", fitClass)}
        />
      ) : media ? (
        // eslint-disable-next-line @next/next/no-img-element -- variante servie par le stockage
        <img src={imageSrc(media, "full")} alt={media.alt} draggable={false} className={cn("h-full w-full", fitClass)} />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[15px] text-white/50">Aucun média</div>
      )}

      {overlay?.text && (
        <p
          className={cn(
            "pointer-events-none absolute whitespace-pre-line text-center text-[22px] font-semibold leading-[1.2] tracking-[-0.02em] text-white [text-shadow:0_1px_12px_rgba(0,0,0,0.6)]",
            typeof overlay.y === "number" ? "w-[88%] -translate-x-1/2 -translate-y-1/2" : "inset-x-6",
            typeof overlay.y !== "number" && position === "top" && "top-[18%]",
            typeof overlay.y !== "number" && position === "middle" && "top-1/2 -translate-y-1/2",
            typeof overlay.y !== "number" && position === "bottom" && "bottom-[16%]",
          )}
          style={typeof overlay.y === "number" ? { left: `${(overlay.x ?? 0.5) * 100}%`, top: `${overlay.y * 100}%` } : undefined}
        >
          {overlay.text}
        </p>
      )}
    </div>
  );
}
