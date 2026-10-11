"use client";

import { useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import type { MediaItem } from "@/lib/feed/types";
import { imageSrc } from "@/lib/media/url";
import { formatDateLong } from "@/lib/format";
import { Lightbox } from "@/components/feed/Lightbox";
import { EmptyState } from "@/components/ui/EmptyState";

export type Album = { post_id: string; slug: string; title: string | null; published_at: string | null; photos: MediaItem[] };

/**
 * Albums photo d'un centre : une section par publication photo (titre, date, grille),
 * galerie plein écran au tap, téléchargement de l'album entier en ZIP (qualité 2 400 px).
 */
export function CenterAlbums({ albums }: { albums: Album[] }) {
  const [open, setOpen] = useState<{ album: Album; index: number } | null>(null);
  if (albums.length === 0) return <EmptyState title="Pas encore d'album" description="Les photos publiées pour ce centre apparaîtront ici, regroupées par publication." />;
  return (
    <div className="space-y-6">
      {albums.map((a) => (
        <section key={a.post_id} className="space-y-2">
          <div className="flex items-end justify-between gap-3 px-1">
            <div className="min-w-0">
              <h2 className="truncate text-[17px] font-semibold tracking-[-0.02em] text-text-1">{a.title ?? "Sans titre"}</h2>
              <p className="text-[13px] text-text-3">
                {a.published_at ? formatDateLong(a.published_at) : ""} · {a.photos.length} photo{a.photos.length > 1 ? "s" : ""} ·{" "}
                <Link href={`/post/${a.slug}`} className="text-navy-link">
                  voir la publication
                </Link>
              </p>
            </div>
            <a
              href={`/api/albums/${a.post_id}`}
              download
              className="pressable inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[12px] bg-bg-2 px-3.5 text-[14px] font-semibold text-text-1"
              aria-label={`Télécharger l'album ${a.title ?? ""} (${a.photos.length} photos)`}
            >
              <Download size={16} strokeWidth={1.75} aria-hidden="true" />
              Télécharger
            </a>
          </div>
          <ul className="grid grid-cols-3 gap-0.5 overflow-hidden rounded-[16px]">
            {a.photos.map((m, i) => (
              <li key={m.id} className="aspect-square bg-bg-1">
                <button type="button" onClick={() => setOpen({ album: a, index: i })} className="block h-full w-full" aria-label={`Photo ${i + 1} sur ${a.photos.length}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- variantes WebP déjà optimisées côté serveur */}
                  <img src={imageSrc(m, "small")} alt={m.alt} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <Lightbox open={open !== null} items={(open?.album.photos ?? []).map((m) => ({ src: imageSrc(m, "full"), alt: m.alt }))} index={open?.index ?? 0} onClose={() => setOpen(null)} />
    </div>
  );
}
