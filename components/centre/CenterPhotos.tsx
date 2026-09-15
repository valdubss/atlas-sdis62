"use client";

import { useState } from "react";
import type { CenterPhoto } from "@/lib/centres/public";
import { imageSrc } from "@/lib/media/url";
import { Lightbox } from "@/components/feed/Lightbox";

/** Grille 3 colonnes des dernières photos du centre ; tap → galerie plein écran. */
export function CenterPhotos({ photos }: { photos: CenterPhoto[] }) {
  const [index, setIndex] = useState<number | null>(null);
  if (photos.length === 0) return null;
  const items = photos.map((p) => ({ src: imageSrc(p.media, "full"), alt: p.media.alt }));
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-[17px] font-semibold tracking-[-0.02em] text-text-1">Photos</h2>
      <ul className="grid grid-cols-3 gap-0.5 overflow-hidden rounded-[16px]">
        {photos.map((p, i) => (
          <li key={p.media.id} className="aspect-square bg-bg-1">
            <button type="button" onClick={() => setIndex(i)} className="block h-full w-full" aria-label={`Photo ${i + 1} sur ${photos.length}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- variantes WebP déjà optimisées côté serveur */}
              <img src={imageSrc(p.media, "small")} alt={p.media.alt} loading="lazy" decoding="async" className="h-full w-full object-cover" />
            </button>
          </li>
        ))}
      </ul>
      <Lightbox open={index !== null} items={items} index={index ?? 0} onClose={() => setIndex(null)} />
    </section>
  );
}
