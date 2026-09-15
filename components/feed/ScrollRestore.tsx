"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { scrollMemory } from "@/lib/feed/reading";

/**
 * Position du fil restaurée au retour d'un post, d'une lightbox ou d'un autre
 * onglet : la position est mémorisée par route (session), puis rétablie au
 * montage de la page. Tant que la page n'est pas assez haute (images, cartes en
 * cours de rendu), on réessaie à chaque changement de taille pendant 2 s, et
 * les défilements intermédiaires ne sont pas mémorisés.
 */
export function ScrollRestore() {
  const pathname = usePathname();
  const restoring = useRef(false);

  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    const saved = scrollMemory.read(pathname);
    if (!saved || saved <= 0) return;
    restoring.current = true;
    const jump = () => window.scrollTo({ top: saved, behavior: "instant" as ScrollBehavior });
    const tall = () => document.documentElement.scrollHeight - window.innerHeight >= saved - 4;
    const done = () => {
      restoring.current = false;
      ro?.disconnect();
      clearTimeout(t);
    };
    let ro: ResizeObserver | null = null;
    requestAnimationFrame(() => {
      jump();
      if (tall()) return done();
      if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(() => {
          jump();
          if (tall()) done();
        });
        ro.observe(document.body);
      }
    });
    const t = setTimeout(() => {
      jump();
      done();
    }, 2000);
    return done;
  }, [pathname]);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (restoring.current) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => scrollMemory.save(pathname, window.scrollY));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [pathname]);
  return null;
}
