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

export function imageSrc(m: MediaItem, size: "thumb" | "medium" | "full" = "medium") {
  if (m.preview_url) return m.preview_url;
  return mediaUrl(m.variants[size] ?? m.variants.medium ?? m.variants.full ?? m.original_key);
}

export function videoSrc(m: MediaItem) {
  return m.preview_url ?? mediaUrl(m.original_key);
}

export function posterSrc(m: MediaItem) {
  if (m.poster_preview_url) return m.poster_preview_url;
  return m.poster_key ? mediaUrl(m.poster_key) : undefined;
}
