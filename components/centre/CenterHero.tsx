/* eslint-disable @next/next/no-img-element -- variantes WebP déjà optimisées côté serveur */
import type { CenterPublic } from "@/lib/centres/public";
import { CENTER_TYPE_LABELS } from "@/lib/config";
import { imageSizes, imageSrc, imageSrcSet } from "@/lib/media/url";

/**
 * Couverture du centre : photo (ou fond sobre), dégradé sur le bas seulement,
 * nom en 28/600, type et groupement en 13.
 */
export function CenterHero({ center }: { center: CenterPublic }) {
  const meta = [CENTER_TYPE_LABELS[center.type], center.grouping?.name, center.city].filter(Boolean).join(" · ");
  if (!center.cover) {
    return (
      <div id="large-title" className="px-1 pb-1 pt-1">
        <h1 className="text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] text-text-1">{center.name}</h1>
        {meta && <p className="mt-1 text-[13px] text-text-3">{meta}</p>}
      </div>
    );
  }
  return (
    <div className="relative -mx-3 overflow-hidden sm:mx-0 sm:rounded-[28px]">
      <div className="aspect-[16/9] w-full bg-bg-1 sm:aspect-[21/9]">
        <img src={imageSrc(center.cover, "medium")} srcSet={imageSrcSet(center.cover)} sizes={imageSizes} alt={center.cover.alt || `Photo du centre ${center.name}`} className="h-full w-full object-cover" fetchPriority="high" />
      </div>
      <div id="large-title" className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-5 pb-4 pt-16">
        <h1 className="text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] text-white">{center.name}</h1>
        {meta && <p className="mt-1 text-[13px] text-white/80">{meta}</p>}
      </div>
    </div>
  );
}
