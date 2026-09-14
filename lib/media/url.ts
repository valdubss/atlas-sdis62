import type { MediaItem } from "@/lib/feed/types";

/**
 * Base publique des médias :
 *  - NEXT_PUBLIC_S3_PUBLIC_URL si un bucket S3/CDN est configuré ;
 *  - sinon l'URL publique du bucket Supabase Storage « media ».
 */
const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET ?? "media";
const BASE = (
  process.env.NEXT_PUBLIC_S3_PUBLIC_URL ||
  `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/${BUCKET}`
).replace(/\/$/, "");

export function mediaUrl(key: string | null | undefined) {
  if (!key) return "";
  if (/^(https?:|blob:|data:)/.test(key)) return key; // URL déjà absolue (aperçu studio)
  return `${BASE}/${key}`;
}

export function imageSrc(m: MediaItem, size: "thumb" | "small" | "medium" | "full" = "medium") {
  if (m.preview_url) return m.preview_url;
  return mediaUrl(m.variants[size] ?? m.variants.medium ?? m.variants.small ?? m.variants.full ?? m.original_key);
}

/** Largeurs maximales des variantes générées par sharp (lib/media/variants.ts). */
const VARIANT_WIDTHS = { thumb: 400, small: 800, medium: 1200, full: 2400 } as const;

/** srcset des variantes disponibles : le navigateur choisit selon la densité d'écran. */
export function imageSrcSet(m: MediaItem): string | undefined {
  if (m.preview_url) return undefined;
  const parts = (Object.keys(VARIANT_WIDTHS) as (keyof typeof VARIANT_WIDTHS)[])
    .filter((k) => m.variants[k])
    .map((k) => `${mediaUrl(m.variants[k])} ${Math.min(VARIANT_WIDTHS[k], m.width ?? VARIANT_WIDTHS[k])}w`);
  return parts.length > 1 ? parts.join(", ") : undefined;
}

/** Largeur d'affichage d'un média du fil (pleine largeur jusqu'à 680 px). */
export const imageSizes = "(max-width: 680px) 100vw, 680px";

export function videoSrc(m: MediaItem) {
  return m.preview_url ?? mediaUrl(m.original_key);
}

export function posterSrc(m: MediaItem) {
  if (m.poster_preview_url) return m.poster_preview_url;
  return m.poster_key ? mediaUrl(m.poster_key) : undefined;
}
