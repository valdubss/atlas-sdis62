"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { SPRING } from "@/lib/motion";
import { lockScroll, unlockScroll } from "@/lib/dom/scroll-lock";
import { Portal } from "@/components/ui/Portal";

export type LightboxItem = { src: string; alt: string };

const MAX_ZOOM = 4;
const DOUBLE_TAP_ZOOM = 2.5;

type View = { zoom: number; x: number; y: number };
const REST: View = { zoom: 1, x: 0, y: 0 };

/**
 * Lightbox plein écran. Une photo, ou une galerie à faire défiler
 * horizontalement (accrochage natif). Le fond fond en noir ; fermeture par
 * glissement vertical qui suit le doigt, tap sur le fond, croix ou Échap.
 *
 * Zoom : pincement à deux doigts (autour du point pincé), double-tap ou
 * double-clic (vers le point touché), déplacement au doigt une fois agrandi,
 * borné aux bords de la photo. Les gestes sont écoutés en natif (non passifs)
 * pour que le navigateur ne fasse pas défiler la galerie pendant un pincement.
 * Le zoom se remet à 1 dès qu'on change de photo.
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
  const scroller = useRef<HTMLDivElement | null>(null);
  // Le conteneur n'existe qu'après le montage du portail : les effets attendent le nœud réel
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const attach = useCallback((n: HTMLDivElement | null) => {
    scroller.current = n;
    setNode(n);
  }, []);
  const [current, setCurrent] = useState(index);
  const currentRef = useRef(index);
  const [dragY, setDragY] = useState(0);
  const [view, setViewState] = useState<View>(REST);
  const viewRef = useRef<View>(REST);
  const [gesturing, setGesturing] = useState(false);
  // Dernier toucher : le double-clic synthétisé par le navigateur après un double-tap est ignoré
  const touchedAt = useRef(0);
  const setView = useCallback((v: View) => {
    viewRef.current = v;
    setViewState(v);
  }, []);
  const resetZoom = useCallback(() => setView(REST), [setView]);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const el = scroller.current;
        if (!el) return;
        e.preventDefault();
        el.scrollBy({ left: (e.key === "ArrowRight" ? 1 : -1) * el.clientWidth, behavior: "smooth" });
      }
    };
    document.addEventListener("keydown", onKey);
    lockScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      unlockScroll();
      opener?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  // Position initiale sur la photo touchée, puis suivi de l'index affiché (zoom remis à 1 au changement)
  useEffect(() => {
    const el = node;
    if (!el || !open) return;
    el.scrollTo({ left: el.clientWidth * index, behavior: "instant" as ScrollBehavior });
    setCurrent(index);
    currentRef.current = index;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const next = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
        if (next !== currentRef.current) {
          currentRef.current = next;
          setCurrent(next);
          resetZoom();
        }
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [open, index, node, resetZoom]);

  /** Déplacement borné : la photo ne sort pas de l'écran au-delà de ses bords agrandis. */
  const clamp = useCallback((v: View): View => {
    const el = scroller.current;
    if (!el || v.zoom <= 1) return { zoom: Math.max(1, v.zoom), x: 0, y: 0 };
    const img = el.querySelector<HTMLImageElement>(`[data-slide="${currentRef.current}"] img`);
    const rect = img?.getBoundingClientRect();
    // Taille rendue à zoom 1 (la mesure inclut le zoom courant)
    const w = rect ? rect.width / viewRef.current.zoom : el.clientWidth;
    const h = rect ? rect.height / viewRef.current.zoom : el.clientHeight;
    // La photo agrandie (w·z × h·z, centrée) couvre l'écran : le déplacement s'arrête à ses bords
    const maxX = Math.max(0, (w * v.zoom - el.clientWidth) / 2);
    const maxY = Math.max(0, (h * v.zoom - el.clientHeight) / 2);
    return { zoom: v.zoom, x: Math.min(maxX, Math.max(-maxX, v.x)), y: Math.min(maxY, Math.max(-maxY, v.y)) };
  }, []);

  /** Zoom vers un point de l'écran (le point reste sous le doigt). */
  const zoomAt = useCallback(
    (clientX: number, clientY: number, nextZoom: number, from: View = viewRef.current) => {
      const el = scroller.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      // Point touché exprimé dans la photo non zoomée : p = (client - centre - pan) / zoom
      const px = (clientX - cx - from.x) / from.zoom;
      const py = (clientY - cy - from.y) / from.zoom;
      const z = Math.min(MAX_ZOOM, Math.max(1, nextZoom));
      setView(clamp({ zoom: z, x: clientX - cx - px * z, y: clientY - cy - py * z }));
    },
    [clamp, setView],
  );

  // Gestes tactiles en natif (non passifs) : pincement, déplacement, glissement vertical, double-tap
  useEffect(() => {
    const el = node;
    if (!el || !open) return;
    let pinch: { d: number; zoom: number; mx: number; my: number; x: number; y: number } | null = null;
    let pan: { x: number; y: number; vx: number; vy: number; moved: boolean } | null = null;
    let swipe: { x: number; y: number; vertical: boolean | null; dy: number } | null = null;
    let lastTap = 0;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = (t: TouchList) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });

    const onStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        const m = mid(e.touches);
        pinch = { d: dist(e.touches), zoom: viewRef.current.zoom, mx: m.x, my: m.y, x: viewRef.current.x, y: viewRef.current.y };
        pan = null;
        swipe = null;
        setGesturing(true);
        e.preventDefault();
        return;
      }
      if (viewRef.current.zoom > 1) {
        pan = { x: e.touches[0].clientX, y: e.touches[0].clientY, vx: viewRef.current.x, vy: viewRef.current.y, moved: false };
        setGesturing(true);
        e.preventDefault();
        return;
      }
      swipe = { x: e.touches[0].clientX, y: e.touches[0].clientY, vertical: null, dy: 0 };
    };
    const onMove = (e: TouchEvent) => {
      if (pinch && e.touches.length >= 2) {
        e.preventDefault();
        const m = mid(e.touches);
        const z = Math.min(MAX_ZOOM, Math.max(1, (pinch.zoom * dist(e.touches)) / pinch.d));
        // Le point pincé reste sous les doigts, les doigts peuvent aussi déplacer la photo
        zoomAt(pinch.mx, pinch.my, z, { zoom: pinch.zoom, x: pinch.x, y: pinch.y });
        const v = viewRef.current;
        setView(clamp({ zoom: v.zoom, x: v.x + (m.x - pinch.mx), y: v.y + (m.y - pinch.my) }));
        return;
      }
      if (pan && e.touches.length === 1) {
        e.preventDefault();
        if (Math.hypot(e.touches[0].clientX - pan.x, e.touches[0].clientY - pan.y) > 8) pan.moved = true;
        setView(clamp({ zoom: viewRef.current.zoom, x: pan.vx + (e.touches[0].clientX - pan.x), y: pan.vy + (e.touches[0].clientY - pan.y) }));
        return;
      }
      if (!swipe) return;
      const dx = e.touches[0].clientX - swipe.x;
      const dy = e.touches[0].clientY - swipe.y;
      if (swipe.vertical === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) swipe.vertical = Math.abs(dy) > Math.abs(dx);
      if (swipe.vertical) {
        swipe.dy = dy;
        setDragY(dy);
      }
    };
    const doubleTap = (t: Touch | undefined) => {
      const now = Date.now();
      touchedAt.current = now;
      if (t && now - lastTap < 300) {
        lastTap = 0;
        if (viewRef.current.zoom > 1) resetZoom();
        else zoomAt(t.clientX, t.clientY, DOUBLE_TAP_ZOOM);
      } else lastTap = now;
    };
    const onEnd = (e: TouchEvent) => {
      if (pinch) {
        if (e.touches.length >= 2) return;
        pinch = null;
        setGesturing(false);
        if (viewRef.current.zoom < 1.05) resetZoom();
        else if (e.touches.length === 1) pan = { x: e.touches[0].clientX, y: e.touches[0].clientY, vx: viewRef.current.x, vy: viewRef.current.y, moved: true };
        return;
      }
      if (pan) {
        if (e.touches.length > 0) return;
        const tapped = !pan.moved;
        pan = null;
        setGesturing(false);
        if (tapped) doubleTap(e.changedTouches[0]);
        return;
      }
      const s = swipe;
      swipe = null;
      if (s?.vertical && Math.abs(s.dy) > 90) {
        onClose();
        return;
      }
      setDragY(0);
      if (s && !s.vertical) doubleTap(e.changedTouches[0]);
    };
    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: false });
    el.addEventListener("touchcancel", onEnd, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [open, node, clamp, zoomAt, setView, resetZoom, onClose]);

  const progress = Math.min(1, Math.abs(dragY) / 260);
  const zoomed = view.zoom > 1;

  return (
    <Portal>
    <AnimatePresence>
      {open && list.length > 0 && (
        <motion.div
          className="fixed inset-0 z-[55] flex min-h-dvh flex-col bg-black"
          data-allow-pinch=""
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
            autoFocus
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
            ref={attach}
            className="no-scrollbar flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden"
            style={{ touchAction: zoomed ? "none" : "pan-x", y: dragY, scale: 1 - progress * 0.1 }}
            transition={dragY === 0 ? SPRING : { duration: 0 }}
          >
            {list.map((it, i) => {
              const active = i === current;
              return (
                <div key={`${it.src}-${i}`} data-slide={i} className="flex h-full w-full flex-none snap-center snap-always items-center justify-center overflow-hidden">
                  <div
                    className="flex h-full w-full items-center justify-center will-change-transform"
                    style={active && zoomed ? { transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`, transition: gesturing || reduced ? "none" : "transform 140ms ease-out" } : { transition: reduced ? "none" : "transform 140ms ease-out" }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      if (Date.now() - touchedAt.current < 700) return;
                      if (viewRef.current.zoom > 1) resetZoom();
                      else zoomAt(e.clientX, e.clientY, DOUBLE_TAP_ZOOM);
                    }}
                  >
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
                </div>
              );
            })}
          </motion.div>

          {caption && (
            <div className="pointer-events-none absolute inset-x-0 bottom-[max(env(safe-area-inset-bottom),20px)] flex justify-center px-5" onClick={(e) => e.stopPropagation()}>
              {caption}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
    </Portal>
  );
}
