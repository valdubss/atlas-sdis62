"use client";

import dynamic from "next/dynamic";
import type { MediaItem } from "@/lib/feed/types";

const VideoPlayer = dynamic(() => import("@/components/feed/VideoPlayer").then((m) => m.VideoPlayer));

/** Dernier clip vidéo du direct en tête de la carte du fil : lecture automatique muette, pastille « EN DIRECT ». */
export function LiveClip({ media }: { media: MediaItem }) {
  return (
    <div className="relative">
      <VideoPlayer media={media} rounded={false} />
      <span className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-red-fill px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-white">
        <span className="h-2 w-2 animate-pulse rounded-full bg-white" aria-hidden="true" />
        En direct
      </span>
    </div>
  );
}
