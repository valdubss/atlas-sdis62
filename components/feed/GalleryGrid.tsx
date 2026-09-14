"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { GalleryItem } from "@/lib/feed/types";
import { loadMoreGallery } from "@/app/(app)/feed-actions";
import { imageSrc } from "@/lib/media/url";
import { formatRelative } from "@/lib/format";
import { Lightbox } from "./Lightbox";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";

const PAGE = 30;

/**
 * Galerie : grille 3 colonnes de vignettes carrées, défilement infini,
 * lightbox partagée avec lien vers la publication.
 */
export function GalleryGrid({ initial }: { initial: GalleryItem[] }) {
  const [items, setItems] = useState(initial);
  const [done, setDone] = useState(initial.length < PAGE);
  const [open, setOpen] = useState<GalleryItem | null>(null);
  const [pending, start] = useTransition();
  const sentinel = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = sentinel.current;
    if (!el || done) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || pending) return;
        start(async () => {
          const last = items[items.length - 1];
          const more = await loadMoreGallery(last ? { at: last.post.published_at, id: last.post.id, position: last.position } : null);
          setItems((p) => {
            const seen = new Set(p.map((x) => x.media.id));
            return [...p, ...more.filter((x) => !seen.has(x.media.id))];
          });
          if (more.length < PAGE) setDone(true);
        });
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [items, done, pending]);

  if (items.length === 0) return <EmptyState title="Pas encore de photos" description="La galerie rassemble toutes les photos publiées dans le fil." />;

  return (
    <>
      <div className="grid grid-cols-3 gap-[3px] overflow-hidden rounded-[16px]">
        {items.map((it) => (
          <button key={it.media.id} type="button" onClick={() => setOpen(it)} className="relative aspect-square overflow-hidden bg-bg-1" aria-label={it.media.alt || it.post.title || "Photo"}>
            <motion.img
              layoutId={reduced ? undefined : `gallery-${it.media.id}`}
              src={imageSrc(it.media, "thumb")}
              alt={it.media.alt}
              loading="lazy"
              decoding="async"
              draggable={false}
              className="h-full w-full object-cover"
            />
          </button>
        ))}
      </div>
      <div ref={sentinel} aria-hidden="true" />
      {pending && (
        <div className="mt-[3px] grid grid-cols-3 gap-[3px]">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-none" />
          ))}
        </div>
      )}

      {open && (
        <Lightbox
          open
          src={imageSrc(open.media, "full")}
          alt={open.media.alt}
          layoutId={`gallery-${open.media.id}`}
          onClose={() => setOpen(null)}
          caption={
            <Link href={`/post/${open.post.slug}`} className="pointer-events-auto glass rounded-full px-4 py-2 text-[15px] font-medium text-white">
              {open.post.title ?? "Voir la publication"} <span className="text-white/60">{formatRelative(open.post.published_at)}</span>
            </Link>
          }
        />
      )}
    </>
  );
}
