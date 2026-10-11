"use client";

import { useEffect } from "react";

/**
 * Pas de zoom de l'interface : le pincement et le double-tap ne grossissent jamais la page.
 * Seules les zones marquées `data-allow-pinch` (photos du fil, galerie plein écran) reçoivent
 * les gestes à deux doigts. Safari iOS : événements `gesturestart/gesturechange` ; partout :
 * `touchmove` à plusieurs doigts, en plus de `touch-action` et de la balise viewport.
 */
export function NoPageZoom() {
  useEffect(() => {
    const allowed = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest("[data-allow-pinch]"));
    const onGesture = (e: Event) => {
      if (!allowed(e.target)) e.preventDefault();
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1 && !allowed(e.target)) e.preventDefault();
    };
    document.addEventListener("gesturestart", onGesture, { passive: false });
    document.addEventListener("gesturechange", onGesture, { passive: false });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      document.removeEventListener("gesturestart", onGesture);
      document.removeEventListener("gesturechange", onGesture);
      document.removeEventListener("touchmove", onTouchMove);
    };
  }, []);
  return null;
}
