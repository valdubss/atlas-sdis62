"use client";

import { useEffect, useRef, useState } from "react";
import { Heart } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { MediaItem } from "@/lib/feed/types";
import { imageSizes, imageSrc, imageSrcSet } from "@/lib/media/url";
import { cn } from "@/lib/cn";
import { Lightbox, type LightboxItem } from "./Lightbox";

/** Nombre de photos chargées d'avance autour de la photo affichée. */
const AHEAD = 2;

/**
 * Carrousel photo : coins 28 px, sans liseré, défilement à accrochage natif,
 * points de position, légende par photo (13 px, repliable), double-tap = ❤️
 * avec animation de pression, aperçu flou (LQIP) sous chaque image, photo
 * suivante préchargée, flèches du clavier sur desktop. Au tap : galerie.
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
  const [burst, setBurst] = useState(0);
  const [captionOpen, setCaptionOpen] = useState(false);
  const lastTap = useRef(0);
  const indexRef = useRef(0);
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
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
        setCaptionOpen(false);
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

  function goTo(i: number) {
    const el = scroller.current;
    if (!el) return;
    const target = Math.max(0, Math.min(media.length - 1, i));
    el.scrollTo({ left: target * el.clientWidth, behavior: reduced ? "auto" : "smooth" });
  }

  const first = media[0];
  const bounds = size === "full" ? [0.5, 2.4] : [0.62, 1.91];
  const ratio = first?.width && first?.height ? Math.min(Math.max(first.width / first.height, bounds[0]), bounds[1]) : 4 / 3;
  const many = media.length > 1;
  const caption = media[index]?.caption ?? null;

  function tap(i: number) {
    if (!interactive) return;
    const now = Date.now();
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      setBurst((b) => b + 1);
      onDoubleTap?.();
      return;
    }
    lastTap.current = now;
    setTimeout(() => {
      if (lastTap.current !== now) return;
      if (onTap) onTap(i);
      else setOpen(i);
    }, 280);
  }

  const galleryItems: LightboxItem[] = media.map((m) => ({ src: imageSrc(m, "full"), alt: m.alt }));

  return (
    <div className="space-y-1.5">
      <div
        ref={root}
        className={cn("relative overflow-hidden bg-bg-1 outline-none", rounded && "rounded-[28px]")}
        style={{ aspectRatio: String(ratio) }}
        tabIndex={many ? 0 : undefined}
        onKeyDown={(e) => {
          if (!many) return;
          if (e.key === "ArrowRight") {
            e.preventDefault();
            goTo(indexRef.current + 1);
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            goTo(indexRef.current - 1);
          }
        }}
      >
        <div
          ref={scroller}
          className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
          style={{ touchAction: "pan-x pan-y", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
          role={many ? "group" : undefined}
          aria-roledescription={many ? "carrousel" : undefined}
          aria-label={many ? `${media.length} photos` : undefined}
        >
          {media.map((m, i) => {
            const near = i <= reach;
            return (
              <div
                key={m.id}
                className="relative h-full w-full flex-none snap-center snap-always bg-cover bg-center"
                style={m.lqip ? { backgroundImage: `url(${m.lqip})` } : undefined}
                aria-label={many ? `Photo ${i + 1} sur ${media.length}` : undefined}
              >
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
                  <div className="h-full w-full" aria-hidden="true" />
                )}
              </div>
            );
          })}
        </div>

        {/* Préchargement de la photo suivante (hors flux) */}
        {many && media[index + 1] && !reduced && (
          // eslint-disable-next-line @next/next/no-img-element -- préchargement invisible
          <img src={imageSrc(media[index + 1], size)} alt="" aria-hidden="true" className="hidden" />
        )}

        {many && (
          <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/50 px-2 py-0.5 text-[11px] font-medium text-white/90 tabular-nums">
            {index + 1}/{media.length}
          </span>
        )}

        <AnimatePresence>
          {burst > 0 && (
            <motion.span
              key={burst}
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: [0, 1, 1, 0], scale: [0.4, 1.15, 1, 1.05] }}
              transition={{ duration: reduced ? 0.01 : 0.7, times: [0, 0.25, 0.7, 1] }}
              aria-hidden="true"
            >
              <Heart size={88} strokeWidth={1} fill="white" className="text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)]" />
            </motion.span>
          )}
        </AnimatePresence>

        {open !== null && <Lightbox open items={galleryItems} index={open} onClose={() => setOpen(null)} />}
      </div>

      {(many || caption) && (
        <div className="flex items-start gap-3 px-1">
          {caption && (
            <button type="button" onClick={() => setCaptionOpen((v) => !v)} className={cn("min-w-0 flex-1 text-left text-[13px] leading-[1.4] text-text-2", !captionOpen && "truncate")} aria-expanded={captionOpen}>
              {caption}
            </button>
          )}
          {many && (
            <div className="ml-auto flex shrink-0 items-center gap-1 pt-[5px]" role="tablist" aria-label="Position">
              {media.slice(0, 12).map((m, i) => (
                <button
                  key={m.id}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  aria-label={`Photo ${i + 1}`}
                  onClick={() => goTo(i)}
                  className={cn("h-1.5 rounded-full transition-[width,background-color] duration-200", i === index ? "w-4 bg-text-1" : "w-1.5 bg-text-4")}
                />
              ))}
              {media.length > 12 && <span className="text-[11px] text-text-4">+{media.length - 12}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
