"use client";

import { useEffect, useRef, type RefObject } from "react";
import { lockScroll, unlockScroll } from "@/lib/dom/scroll-lock";

/**
 * Zoom pincé directement sur une photo du fil, façon Instagram : à deux doigts, la photo se
 * détache au-dessus de la page (copie en position fixe, fond assombri), suit l'écartement et
 * le déplacement des doigts (×1 à ×4), puis revient à sa place au relâchement. La publication
 * ne s'ouvre pas, le fil ne défile pas pendant le geste. Écouteurs natifs non passifs (React
 * déclare les siens passifs) ; tout se joue en transform/opacity (compositeur).
 */
export function usePinchZoom(scroller: RefObject<HTMLElement | null>, enabled = true) {
  const lastPinch = useRef(0);

  useEffect(() => {
    const el = scroller.current;
    if (!el || !enabled || typeof window === "undefined" || !("ontouchstart" in window)) return;

    let overlay: HTMLDivElement | null = null;
    let clone: HTMLImageElement | null = null;
    let source: HTMLImageElement | null = null;
    let rect: DOMRect | null = null;
    let d0 = 0;
    let mid0 = { x: 0, y: 0 };
    let active = false;
    let scale = 1;

    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = (t: TouchList) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });

    const end = () => {
      if (!active) return;
      active = false;
      lastPinch.current = Date.now();
      const o = overlay;
      const c = clone;
      const s = source;
      overlay = clone = source = null;
      el.style.overflowX = "";
      unlockScroll();
      if (c && o) {
        c.style.transition = "transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)";
        o.style.transition = "background-color 180ms ease";
        c.style.transform = "translate(0px, 0px) scale(1)";
        o.style.backgroundColor = "rgba(0, 0, 0, 0)";
        setTimeout(() => {
          o.remove();
          if (s) s.style.visibility = "";
        }, 190);
      } else if (s) s.style.visibility = "";
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2 || active) return;
      const target = (e.target as Element | null)?.closest("img");
      if (!target || !el.contains(target)) return;
      e.preventDefault();
      source = target as HTMLImageElement;
      rect = source.getBoundingClientRect();
      d0 = dist(e.touches) || 1;
      mid0 = mid(e.touches);
      scale = 1;
      active = true;
      lockScroll();
      el.style.overflowX = "hidden";
      overlay = document.createElement("div");
      overlay.setAttribute("aria-hidden", "true");
      overlay.style.cssText = "position:fixed;inset:0;z-index:80;pointer-events:none;background-color:rgba(0,0,0,0)";
      clone = document.createElement("img");
      clone.src = source.currentSrc || source.src;
      clone.alt = "";
      clone.draggable = false;
      clone.style.cssText = `position:absolute;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;object-fit:contain;transform-origin:${mid0.x - rect.left}px ${mid0.y - rect.top}px;will-change:transform;border-radius:4px`;
      overlay.appendChild(clone);
      document.body.appendChild(overlay);
      source.style.visibility = "hidden";
    };

    const onMove = (e: TouchEvent) => {
      if (!active || !clone || !overlay) return;
      if (e.touches.length < 2) return end();
      e.preventDefault();
      scale = Math.min(4, Math.max(1, dist(e.touches) / d0));
      const m = mid(e.touches);
      clone.style.transform = `translate(${m.x - mid0.x}px, ${m.y - mid0.y}px) scale(${scale})`;
      overlay.style.backgroundColor = `rgba(0, 0, 0, ${Math.min(0.75, (scale - 1) * 0.5)})`;
    };

    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", end, { passive: true });
    el.addEventListener("touchcancel", end, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
      end();
    };
  }, [scroller, enabled]);

  /** Vrai juste après un pincement : le tap qui peut suivre ne doit pas ouvrir la publication. */
  return { recentlyPinched: () => Date.now() - lastPinch.current < 400 };
}
