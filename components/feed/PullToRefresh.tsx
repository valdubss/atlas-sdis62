"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Loader2 } from "lucide-react";

const THRESHOLD = 72;
const MAX_PULL = 110;

/**
 * Tirer vers le bas en haut du fil pour recharger (façon Instagram). Tactile
 * uniquement : au-delà du seuil, `router.refresh()` recharge les données du
 * serveur sans perdre la position. Indicateur discret sous la barre haute.
 */
export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [refreshing, startTransition] = useTransition();
  const startY = useRef<number | null>(null);
  const startX = useRef(0);
  const engaged = useRef(false);
  const pullRef = useRef(0);
  const reduced = useReducedMotion();

  const refresh = useCallback(() => {
    if (navigator.vibrate) navigator.vibrate(8);
    startTransition(() => router.refresh());
  }, [router]);

  useEffect(() => {
    const overlayOpen = () => document.documentElement.hasAttribute("data-sheet-open") || document.querySelector('[role="dialog"]') !== null;
    const onStart = (e: TouchEvent) => {
      const target = e.target as Element | null;
      const inOverlay = overlayOpen() || Boolean(target?.closest?.('[role="dialog"]'));
      startY.current = window.scrollY <= 0 && !refreshing && !inOverlay ? e.touches[0].clientY : null;
      startX.current = e.touches[0].clientX;
      engaged.current = false;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      if (overlayOpen()) {
        startY.current = null;
        pullRef.current = 0;
        setPull(0);
        return;
      }
      const dy = e.touches[0].clientY - startY.current;
      const dx = e.touches[0].clientX - startX.current;
      if (!engaged.current) {
        // Verrouillage de direction : un carrousel ou un glissement horizontal
        // ne doit jamais faire bouger le fil.
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 6) {
          startY.current = null;
          return;
        }
        if (dy < 10) return;
        engaged.current = true;
      }
      // Résistance progressive
      pullRef.current = dy <= 0 || window.scrollY > 0 ? 0 : Math.min(MAX_PULL, dy * 0.5);
      setPull(pullRef.current);
    };
    const onEnd = () => {
      if (startY.current === null) return;
      startY.current = null;
      const reached = pullRef.current >= THRESHOLD;
      pullRef.current = 0;
      setPull(0);
      if (reached) refresh();
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [refresh, refreshing]);

  const offset = refreshing ? 48 : pull;
  const progress = Math.min(1, pull / THRESHOLD);

  return (
    <div className="relative">
      <div
        aria-live="polite"
        aria-label={refreshing ? "Actualisation du fil" : undefined}
        className="pointer-events-none absolute inset-x-0 top-0 flex justify-center"
        style={{ height: offset, opacity: refreshing ? 1 : progress }}
      >
        <motion.span
          className="mt-2 flex h-8 w-8 items-center justify-center rounded-full bg-bg-2 text-text-1 shadow-float"
          animate={refreshing && !reduced ? { rotate: 360 } : { rotate: progress * 270 }}
          transition={refreshing ? { repeat: Infinity, duration: 0.9, ease: "linear" } : { duration: 0 }}
        >
          <Loader2 size={18} strokeWidth={2} aria-hidden="true" />
        </motion.span>
      </div>
      <motion.div
        animate={{ y: offset }}
        transition={pull > 0 && !refreshing ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 32 }}
      >
        {children}
      </motion.div>
    </div>
  );
}
