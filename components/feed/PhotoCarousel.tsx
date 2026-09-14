"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { MediaItem } from "@/lib/feed/types";
import { imageSrc } from "@/lib/media/url";
import { cn } from "@/lib/cn";
import { Lightbox } from "./Lightbox";

/**
 * Carrousel photo : coins 28 px, sans liseré, object-fit cover, défilement à
 * accrochage, compteur discret. Au tap : transition partagée vers la lightbox.
 */
export function PhotoCarousel({
  media,
  size = "medium",
  onDoubleTap,
  interactive = true,
  rounded = true,
}: {
  media: MediaItem[];
  size?: "medium" | "full";
  onDoubleTap?: () => void;
  interactive?: boolean;
  rounded?: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const lastTap = useRef(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setIndex(Math.round(el.scrollLeft / el.clientWidth)));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  const first = media[0];
  const ratio = first?.width && first?.height ? Math.min(Math.max(first.width / first.height, 0.8), 1.91) : 4 / 3;
  const many = media.length > 1;

  function tap(i: number) {
    if (!interactive) return;
    const now = Date.now();
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      onDoubleTap?.();
      return;
    }
    lastTap.current = now;
    // Simple tap : ouverture différée pour laisser une chance au double-tap
    setTimeout(() => {
      if (lastTap.current === now) setOpen(i);
    }, 280);
  }

  const current = open !== null ? media[open] : null;

  return (
    <div className={cn("relative overflow-hidden bg-bg-1", rounded && "rounded-[28px]")} style={{ aspectRatio: String(ratio) }}>
      <div
        ref={scroller}
        className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
        role={many ? "group" : undefined}
        aria-roledescription={many ? "carrousel" : undefined}
        aria-label={many ? `${media.length} photos` : undefined}
      >
        {media.map((m, i) => (
          <div key={m.id} className="h-full w-full flex-none snap-center" aria-label={many ? `Photo ${i + 1} sur ${media.length}` : undefined}>
            <motion.img
              layoutId={reduced || open === i ? undefined : `photo-${m.id}`}
              src={imageSrc(m, size)}
              alt={m.alt}
              width={m.width ?? undefined}
              height={m.height ?? undefined}
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
              draggable={false}
              onClick={() => tap(i)}
              className={cn("h-full w-full select-none object-cover", interactive && "cursor-zoom-in")}
            />
          </div>
        ))}
      </div>

      {many && (
        <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/50 px-2 py-0.5 text-[11px] font-medium text-white/90 tabular-nums">
          {index + 1}/{media.length}
        </span>
      )}

      {current && (
        <Lightbox open src={imageSrc(current, "full")} alt={current.alt} layoutId={`photo-${current.id}`} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}
