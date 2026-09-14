"use client";

import { useEffect } from "react";
import type { FeedPost } from "@/lib/feed/types";
import { imageSrc } from "@/lib/media/url";

export const FEED_CACHE_KEY = "atlas:feed:v1";
const MEDIA_CACHE = "atlas-media";
const MAX_POSTS = 20;
const MAX_MEDIA = 120;

/**
 * Lecture hors ligne : garde les dernières publications du fil et leurs
 * vignettes sur l'appareil. La page /offline (servie par le service worker
 * quand le réseau manque) les rejoue en lecture seule.
 */
export function FeedCache({ posts }: { posts: FeedPost[] }) {
  useEffect(() => {
    const slice = posts.slice(0, MAX_POSTS);
    try {
      localStorage.setItem(FEED_CACHE_KEY, JSON.stringify({ at: Date.now(), posts: slice }));
    } catch {
      /* stockage plein ou indisponible */
    }
    if (typeof caches === "undefined" || !("serviceWorker" in navigator)) return;
    const urls: string[] = [];
    for (const p of slice) {
      for (const m of p.media.filter((x) => x.kind === "image").slice(0, 3)) urls.push(imageSrc(m, "small"));
      if (p.cover) urls.push(imageSrc(p.cover, "small"));
    }
    const run = async () => {
      const cache = await caches.open(MEDIA_CACHE);
      const have = new Set((await cache.keys()).map((r) => r.url));
      for (const u of urls) {
        if (have.has(u)) continue;
        try {
          await cache.add(new Request(u, { mode: "no-cors" }));
        } catch {
          /* réseau ou CORS : la vignette manquera hors ligne */
        }
      }
      // Coupe l'excédent (plus anciennes entrées d'abord)
      const keys = await cache.keys();
      for (const k of keys.slice(0, Math.max(0, keys.length - MAX_MEDIA))) await cache.delete(k);
      // Page hors ligne et ses scripts, une fois par version
      const shellFlag = `atlas:offline-shell:${process.env.NEXT_PUBLIC_APP_VERSION ?? "dev"}`;
      if (!sessionStorage.getItem(shellFlag)) {
        try {
          const res = await fetch("/offline", { credentials: "same-origin" });
          const html = await res.text();
          const shell = await caches.open("atlas-shell");
          await shell.put("/offline", new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } }));
          const scripts = [...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)].map((m) => m[1]);
          await Promise.all(scripts.map((s) => shell.add(s).catch(() => {})));
          sessionStorage.setItem(shellFlag, "1");
        } catch {
          /* hors ligne au premier chargement : la page sera préparée plus tard */
        }
      }
    };
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (idle) idle(() => void run());
    else setTimeout(() => void run(), 1500);
  }, [posts]);
  return null;
}
