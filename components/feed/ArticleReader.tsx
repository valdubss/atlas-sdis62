"use client";

import { useEffect, useRef, useState } from "react";
import { recordPostRead } from "@/app/(app)/feed-actions";
import { extractToc, readingProgress, resumeMemory, type TocEntry } from "@/lib/feed/reading";
import { cn } from "@/lib/cn";

/**
 * Lecture d'un article : barre de progression 2 px en haut, sommaire flottant
 * sur desktop (titres H2), reprise où l'on en était (position locale), lecture
 * qualifiée à 80 % de défilement.
 */
export function ArticleReader({ slug, postId, body, children }: { slug: string; postId: string; body: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState<string | null>(null);
  const [resume, setResume] = useState<number | null>(null);
  const toc: TocEntry[] = extractToc(body);
  const readSent = useRef(false);

  // Identifiants sur les H2 rendus par le Markdown (sommaire cliquable)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const hs = Array.from(el.querySelectorAll("h2"));
    hs.forEach((h, i) => {
      if (toc[i]) h.id = toc[i].id;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une fois par article
  }, [slug]);

  useEffect(() => {
    const saved = resumeMemory.read(slug);
    if (saved && saved > 0.05) setResume(saved);
  }, [slug]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const top = rect.top + window.scrollY;
      const p = readingProgress(top, rect.height, window.innerHeight, window.scrollY);
      setProgress(p);
      resumeMemory.save(slug, p);
      if (p >= 0.8 && !readSent.current) {
        readSent.current = true;
        recordPostRead(postId).catch(() => {});
      }
      const hs = Array.from(el.querySelectorAll("h2"));
      const current = hs.filter((h) => h.getBoundingClientRect().top <= 120).pop();
      setActive(current?.id ?? null);
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [slug, postId]);

  function jumpToResume() {
    const el = ref.current;
    if (!el || resume === null) return;
    const rect = el.getBoundingClientRect();
    const top = rect.top + window.scrollY;
    const y = top + resume * (rect.height - window.innerHeight);
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    setResume(null);
  }

  return (
    <>
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-[calc(48px+env(safe-area-inset-top))] z-30 h-[2px] bg-transparent">
        <div className="h-full bg-text-1 transition-[width] duration-150" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      {resume !== null && progress < 0.05 && (
        <button type="button" onClick={jumpToResume} className="glass-float pressable fixed bottom-[calc(max(env(safe-area-inset-bottom),12px)+72px)] left-1/2 z-30 -translate-x-1/2 rounded-full px-4 py-2 text-[13px] font-medium text-text-1">
          Reprendre où j&apos;en étais · {Math.round(resume * 100)} %
        </button>
      )}
      {toc.length > 1 && (
        <nav aria-label="Sommaire" className="fixed left-[calc(50%+360px)] top-[calc(48px+env(safe-area-inset-top)+24px)] z-20 hidden w-[220px] xl:block">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-3">Sommaire</p>
          <ul className="space-y-1">
            {toc.map((t) => (
              <li key={t.id}>
                <a href={`#${t.id}`} className={cn("block truncate border-l-2 py-1 pl-3 text-[13px]", active === t.id ? "border-text-1 text-text-1" : "border-transparent text-text-3 hover:text-text-1")}>
                  {t.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <div ref={ref}>{children}</div>
    </>
  );
}
