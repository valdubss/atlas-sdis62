import type { MediaItem } from "@/lib/feed/types";

const BASE = (process.env.NEXT_PUBLIC_S3_PUBLIC_URL ?? "").replace(/\/$/, "");

/** URL publique d'une clé S3 (lot c : bucket configuré via NEXT_PUBLIC_S3_PUBLIC_URL). */
export function mediaUrl(key: string | null | undefined) {
  if (!key) return "";
  return `${BASE}/${key}`;
}

export function imageSrc(m: MediaItem, size: "thumb" | "medium" | "full" = "medium") {
  return mediaUrl(m.variants[size] ?? m.variants.medium ?? m.variants.full ?? m.original_key);
}
