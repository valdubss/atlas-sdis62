"use client";

import { useEffect, useRef, useState } from "react";
import type { MediaItem } from "@/lib/feed/types";
import { imageSizes, imageSrc, imageSrcSet } from "@/lib/media/url";
import { cn } from "@/lib/cn";
import { Lightbox, type LightboxItem } from "./Lightbox";

/** Nombre de photos chargées d'avance autour de la photo affichée. */
const AHEAD = 2;

/**
 * Carrousel photo : coins 28 px, sans liseré, object-fit cover, défilement à
 * accrochage natif (aucune animation JS pendant le geste), compteur discret.
 * Les photos voisines sont préchargées pour que chaque glissement soit net.
 * Au tap : lightbox plein écran.
 */
export function PhotoCarousel({
  media,
  size = "medium",
  onDoubleTap,
  onTap,
  interactive = true,
  rounded = true,
}: {
  media: MediaItem[];
  size?: "medium" | "full";
  onDoubleTap?: () => void;
  /** Tap simple : par défaut, ouverture de la galerie plein écran. */
  onTap?: (index: number) => void;
  interactive?: boolean;
  rounded?: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [reach, setReach] = useState(AHEAD);
  const [open, setOpen] = useState<number | null>(null);
  const lastTap = useRef(0);
  const indexRef = useRef(0);
  const root = useRef<HTMLDivElement>(null);
  // Carrousel proche de l'écran : ses photos voisines se chargent tout de suite
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "300px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
      if (i !== indexRef.current) {
        indexRef.current = i;
        setIndex(i);
        setReach((r) => Math.max(r, i + AHEAD));
      }
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  const first = media[0];
  // Ratio natif de la première photo (borné : jamais plus haut que 4:5 dans le
  // fil, jusqu'à 1:2 en page de lecture). Les photos ne sont jamais recadrées :
  // celles d'un autre format s'affichent entières sur le fond de la carte.
  const bounds = size === "full" ? [0.5, 2.4] : [0.75, 1.91];
  const ratio = first?.width && first?.height ? Math.min(Math.max(first.width / first.height, bounds[0]), bounds[1]) : 4 / 3;
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
      if (lastTap.current !== now) return;
      if (onTap) onTap(i);
      else setOpen(i);
    }, 280);
  }

  const galleryItems: LightboxItem[] = media.map((m) => ({ src: imageSrc(m, "full"), alt: m.alt }));

  return (
    <div ref={root} className={cn("relative overflow-hidden bg-bg-1", rounded && "rounded-[28px]")} style={{ aspectRatio: String(ratio) }}>
      <div
        ref={scroller}
        className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
        style={{ touchAction: "pan-x pan-y", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
        role={many ? "group" : undefined}
        aria-roledescription={many ? "carrousel" : undefined}
        aria-label={many ? `${media.length} photos` : undefined}
      >
        {media.map((m, i) => {
          // Au-delà des photos voisines, une image vide : rien à décoder tant qu'on n'approche pas
          const near = i <= reach;
          return (
            <div key={m.id} className="h-full w-full flex-none snap-center snap-always" aria-label={many ? `Photo ${i + 1} sur ${media.length}` : undefined}>
              {near ? (
                // eslint-disable-next-line @next/next/no-img-element -- variantes WebP maison, pas d'optimiseur Vercel
                <img
                  src={imageSrc(m, size)}
                  srcSet={imageSrcSet(m)}
                  sizes={imageSizes}
                  alt={m.alt}
                  width={m.width ?? undefined}
                  height={m.height ?? undefined}
                  loading={i === 0 || visible ? "eager" : "lazy"}
                  fetchPriority={i === 0 ? "high" : "auto"}
                  decoding="async"
                  draggable={false}
                  onClick={() => tap(i)}
                  className={cn("h-full w-full select-none object-contain", interactive && "cursor-zoom-in")}
                />
              ) : (
                <div className="h-full w-full bg-bg-2" aria-hidden="true" />
              )}
            </div>
          );
        })}
      </div>

      {many && (
        <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/50 px-2 py-0.5 text-[11px] font-medium text-white/90 tabular-nums">
          {index + 1}/{media.length}
        </span>
      )}

      {open !== null && <Lightbox open items={galleryItems} index={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
