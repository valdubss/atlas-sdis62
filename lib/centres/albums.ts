import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { MediaItem } from "@/lib/feed/types";
import type { Album } from "@/components/centre/CenterAlbums";

const MEDIA = "id, kind, variants, poster_key, width, height, alt, mime, original_key, status";

/** Albums d'un centre : chaque publication photo publiée du centre avec ses images, la plus récente d'abord. */
export async function fetchCenterAlbums(centerId: string, limit = 40): Promise<Album[]> {
  const supabase = await createClient();
  const { data: posts } = await supabase
    .from("posts")
    .select("id, slug, title, published_at")
    .eq("scope", "center")
    .eq("center_id", centerId)
    .eq("type", "photo")
    .eq("status", "published")
    .is("deleted_at", null)
    .order("published_at", { ascending: false })
    .limit(limit);
  if (!posts?.length) return [];
  const { data: rows } = await supabase
    .from("post_media")
    .select(`post_id, position, media:media!post_media_media_id_fkey(${MEDIA})`)
    .in(
      "post_id",
      posts.map((p) => p.id),
    )
    .order("position");
  const byPost = new Map<string, MediaItem[]>();
  for (const r of (rows ?? []) as unknown as { post_id: string; position: number; media: (MediaItem & { status: string }) | null }[]) {
    if (!r.media || r.media.kind !== "image" || r.media.status !== "ready") continue;
    byPost.set(r.post_id, [...(byPost.get(r.post_id) ?? []), { ...(r.media as MediaItem), alt: r.media.alt ?? "" }]);
  }
  return posts
    .map((p) => ({ post_id: p.id, slug: p.slug, title: p.title, published_at: p.published_at, photos: byPost.get(p.id) ?? [] }))
    .filter((a) => a.photos.length > 0);
}
