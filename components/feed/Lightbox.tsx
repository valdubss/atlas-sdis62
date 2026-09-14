"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { SPRING } from "@/lib/motion";
import { lockScroll, unlockScroll } from "@/lib/dom/scroll-lock";

export type LightboxItem = { src: string; alt: string };

/**
 * Lightbox plein écran. Une photo, ou une galerie à faire défiler
 * horizontalement (accrochage natif). Le fond fond en noir ; fermeture par
 * glissement vertical qui suit le doigt, tap sur le fond, croix ou Échap.
 */
export function Lightbox({
  open,
  src,
  alt = "",
  items,
  index = 0,
  layoutId,
  onClose,
  caption,
}: {
  open: boolean;
  src?: string;
  alt?: string;
  items?: LightboxItem[];
  index?: number;
  layoutId?: string;
  onClose: () => void;
  caption?: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  const list: LightboxItem[] = items ?? (src ? [{ src, alt }] : []);
  const gallery = list.length > 1;
  const scroller = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(index);
  const [dragY, setDragY] = useState(0);
  const touch = useRef<{ x: number; y: number; vertical: boolean | null } | null>(null);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    lockScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      unlockScroll();
      opener?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  // Position initiale sur la photo touchée, puis suivi de l'index affiché
  useEffect(() => {
    const el = scroller.current;
    if (!el || !open) return;
    el.scrollTo({ left: el.clientWidth * index, behavior: "instant" as ScrollBehavior });
    setCurrent(index);
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setCurrent(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [open, index]);

  function onTouchStart(e: React.TouchEvent) {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, vertical: null };
  }
  function onTouchMove(e: React.TouchEvent) {
    const t = touch.current;
    if (!t) return;
    const dx = e.touches[0].clientX - t.x;
    const dy = e.touches[0].clientY - t.y;
    if (t.vertical === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) t.vertical = Math.abs(dy) > Math.abs(dx);
    if (t.vertical) setDragY(dy);
  }
  function onTouchEnd() {
    const t = touch.current;
    touch.current = null;
    if (t?.vertical && Math.abs(dragY) > 90) onClose();
    else setDragY(0);
  }

  const progress = Math.min(1, Math.abs(dragY) / 260);

  return (
    <AnimatePresence>
      {open && list.length > 0 && (
        <motion.div
          className="fixed inset-0 z-[55] flex min-h-dvh flex-col bg-black"
          style={{ backgroundColor: `rgba(0,0,0,${1 - progress * 0.6})` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={gallery ? `Photos, ${current + 1} sur ${list.length}` : list[0].alt || "Photo"}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="absolute right-3 top-[max(env(safe-area-inset-top),12px)] z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white"
          >
            <X size={22} strokeWidth={1.75} aria-hidden="true" />
          </button>
          {gallery && (
            <span className="pointer-events-none absolute left-1/2 top-[max(env(safe-area-inset-top),12px)] z-10 -translate-x-1/2 rounded-full bg-black/40 px-3 py-2 text-[13px] font-medium tabular-nums text-white/90">
              {current + 1}/{list.length}
            </span>
          )}

          <motion.div
            ref={scroller}
            className="no-scrollbar flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden"
            style={{ touchAction: "pan-x", y: dragY, scale: 1 - progress * 0.1 }}
            transition={dragY === 0 ? SPRING : { duration: 0 }}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchEnd}
          >
            {list.map((it, i) => (
              <div key={`${it.src}-${i}`} className="flex h-full w-full flex-none snap-center snap-always items-center justify-center">
                {i === index && layoutId && !reduced ? (
                  <motion.img layoutId={layoutId} src={it.src} alt={it.alt} className="max-h-full max-w-full select-none object-contain" draggable={false} onClick={(e) => e.stopPropagation()} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- variante servie par le stockage
                  <img
                    src={it.src}
                    alt={it.alt}
                    loading={Math.abs(i - current) <= 1 ? "eager" : "lazy"}
                    decoding="async"
                    className="max-h-full max-w-full select-none object-contain"
                    draggable={false}
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
              </div>
            ))}
          </motion.div>

          {caption && (
            <div className="pointer-events-none absolute inset-x-0 bottom-[max(env(safe-area-inset-bottom),20px)] flex justify-center px-5" onClick={(e) => e.stopPropagation()}>
              {caption}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
