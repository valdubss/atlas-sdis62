"use client";

import { useEffect, useRef, useState } from "react";
import type { MediaItem } from "@/lib/feed/types";
import { imageSrc } from "@/lib/media/url";
import { cn } from "@/lib/cn";

/**
 * Carrousel photo façon Instagram : défilement horizontal avec accrochage,
 * ratio uniforme (celui de la première image, borné entre 4:5 et 1.91:1),
 * compteur et points de position.
 */
export function PhotoCarousel({
  media,
  size = "medium",
  onTap,
  onDoubleTap,
}: {
  media: MediaItem[];
  size?: "medium" | "full";
  onTap?: () => void;
  onDoubleTap?: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

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

  function go(delta: number) {
    const el = scroller.current;
    if (!el) return;
    const next = Math.min(Math.max(index + delta, 0), media.length - 1);
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  }

  return (
    <div className="relative select-none bg-black" style={{ aspectRatio: String(ratio) }}>
      <div
        ref={scroller}
        className="flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onClick={onTap}
        onDoubleClick={onDoubleTap}
        role={many ? "group" : undefined}
        aria-roledescription={many ? "carrousel" : undefined}
        aria-label={many ? `${media.length} photos` : undefined}
      >
        {media.map((m, i) => (
          <div key={m.id} className="h-full w-full flex-none snap-center" aria-label={many ? `Photo ${i + 1} sur ${media.length}` : undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element -- variantes WebP servies par le stockage */}
            <img
              src={imageSrc(m, size)}
              alt={m.alt}
              width={m.width ?? undefined}
              height={m.height ?? undefined}
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
              draggable={false}
              className="h-full w-full object-cover"
            />
          </div>
        ))}
      </div>

      {many && (
        <>
          <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white tabular-nums">
            {index + 1}/{media.length}
          </span>
          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1.5" aria-hidden="true">
            {media.map((m, i) => (
              <span key={m.id} className={cn("h-1.5 w-1.5 rounded-full transition-colors", i === index ? "bg-white" : "bg-white/40")} />
            ))}
          </div>
          <button
            type="button"
            aria-label="Photo précédente"
            onClick={() => go(-1)}
            className={cn("absolute left-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-navy shadow-soft sm:flex", index === 0 && "invisible")}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Photo suivante"
            onClick={() => go(1)}
            className={cn("absolute right-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-navy shadow-soft sm:flex", index === media.length - 1 && "invisible")}
          >
            ›
          </button>
        </>
      )}
    </div>
  );
}
