"use client";

import { useEffect, useRef } from "react";
import { recordPostRead } from "@/app/(app)/feed-actions";

const sent = new Set<string>();

/**
 * Lecture qualifiée d'une carte du fil : visible à 50 % pendant 2 s → « lu ».
 * Une seule remontée par publication et par session de page.
 */
export function ReadTracker({ postId, enabled = true, children }: { postId: string; enabled?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el || sent.has(postId) || typeof IntersectionObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.intersectionRatio >= 0.5) {
          if (!timer)
            timer = setTimeout(() => {
              if (sent.has(postId)) return;
              sent.add(postId);
              recordPostRead(postId).catch(() => {});
              io.disconnect();
            }, 2000);
        } else if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      },
      { threshold: [0, 0.5, 1] },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [postId, enabled]);
  return <div ref={ref}>{children}</div>;
}
