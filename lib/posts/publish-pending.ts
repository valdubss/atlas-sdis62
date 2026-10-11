import "server-only";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export type PublishedPending = { id: string; title: string | null; author_id: string | null };

/**
 * Publie les brouillons marqués « à publier dès la fin de l'envoi » dont tous les médias sont
 * prêts. Appelé par l'app après chaque média finalisé (lib/media… → tryPublishPending) et par
 * le cron quotidien en filet de sécurité. Un média en échec lève le marqueur : le brouillon
 * reste à corriger dans le Studio.
 */
export async function publishPendingPosts(opts: { mediaId?: string; authorId?: string } = {}): Promise<PublishedPending[]> {
  const db = createAdminClient();
  let query = db.from("posts").select("id, title, author_id, cover_media_id, post_media(media_id)").eq("publish_when_ready", true).eq("status", "draft").is("deleted_at", null);
  if (opts.authorId) query = query.eq("author_id", opts.authorId);
  const { data: posts } = await query;
  const published: PublishedPending[] = [];
  for (const p of (posts ?? []) as unknown as { id: string; title: string | null; author_id: string | null; cover_media_id: string | null; post_media: { media_id: string }[] | null }[]) {
    const ids = [...new Set([...(p.post_media ?? []).map((m) => m.media_id), ...(p.cover_media_id ? [p.cover_media_id] : [])])];
    if (opts.mediaId && !ids.includes(opts.mediaId)) continue;
    if (ids.length > 0) {
      const { data: rows } = await db.from("media").select("id, status").in("id", ids);
      const statuses = (rows ?? []).map((r) => r.status);
      if (statuses.length !== ids.length || statuses.includes("failed")) {
        await db.from("posts").update({ publish_when_ready: false }).eq("id", p.id);
        continue;
      }
      if (statuses.some((s) => s !== "ready")) continue;
    }
    const { error } = await db.from("posts").update({ status: "published", publish_when_ready: false }).eq("id", p.id);
    if (!error) published.push({ id: p.id, title: p.title, author_id: p.author_id });
  }
  if (published.length > 0) {
    revalidatePath("/");
    revalidatePath("/studio");
    revalidatePath("/studio/posts");
  }
  return published;
}
