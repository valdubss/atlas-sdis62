"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getStorage } from "@/lib/storage";
import { extensionFor, mediaKeys } from "@/lib/media/keys";
import { makeImageVariants } from "@/lib/media/variants";
import { faststart } from "@/lib/media/faststart";
import { ACCEPTED_IMAGE_MIMES, LIMITS } from "@/lib/config";
import type { MediaItem } from "@/lib/feed/types";
import type { Tables } from "@/lib/supabase/database.types";

const createSchema = z.object({
  kind: z.enum(["image", "video"]),
  mime: z.string().min(3).max(100),
  size: z.number().int().positive(),
  width: z.number().int().positive().max(20000),
  height: z.number().int().positive().max(20000),
  duration: z.number().nonnegative().max(3600).optional(),
  hasPoster: z.boolean().optional(),
});

export type CreateUploadResult =
  | {
      ok: true;
      mediaId: string;
      key: string;
      upload: { url: string; method: "PUT"; headers: Record<string, string> };
      posterUpload?: { url: string; method: "PUT"; headers: Record<string, string> };
    }
  | { ok: false; error: string };

/**
 * Étape 1 : crée la ligne media (statut uploading) et signe l'URL d'upload.
 * Réservé aux éditeurs (RLS sur media).
 */
export async function createUpload(input: unknown): Promise<CreateUploadResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Fichier invalide." };
  const v = parsed.data;

  if (v.kind === "image") {
    if (!(ACCEPTED_IMAGE_MIMES as readonly string[]).includes(v.mime)) return { ok: false, error: "Format d'image refusé." };
    if (v.size > LIMITS.imageMaxBytes) return { ok: false, error: `Image trop lourde (${Math.round(LIMITS.imageMaxBytes / 1048576)} Mo max).` };
  } else {
    if (v.mime !== "video/mp4") return { ok: false, error: "Seules les vidéos MP4 H.264 sont acceptées." };
    if (v.size > LIMITS.videoMaxBytes) return { ok: false, error: `Vidéo trop lourde (${Math.round(LIMITS.videoMaxBytes / 1048576)} Mo max).` };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée." };

  // Les agents (lecteurs) ne peuvent envoyer que des images (signalement, contribution)
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const editor = me?.role === "editor" || me?.role === "admin";
  if (!editor && v.kind !== "image") return { ok: false, error: "Seules les images sont acceptées." };

  const id = crypto.randomUUID();
  const key = v.kind === "video" ? mediaKeys.video(id) : mediaKeys.original(id, extensionFor(v.mime));
  const posterKey = v.kind === "video" && v.hasPoster ? mediaKeys.poster(id) : null;

  const { error } = await supabase.from("media").insert({
    id,
    owner_id: user.id,
    kind: v.kind,
    status: "uploading",
    mime: v.mime,
    size_bytes: v.size,
    original_key: key,
    poster_key: posterKey,
    width: v.width,
    height: v.height,
    duration_s: v.duration ?? null,
  });
  if (error) return { ok: false, error: "Création du média refusée (droits éditeur requis)." };

  try {
    const storage = getStorage();
    const upload = await storage.presignUpload(key, v.mime, v.size);
    const posterUpload = posterKey ? await storage.presignUpload(posterKey, "image/jpeg", 0) : undefined;
    return { ok: true, mediaId: id, key, upload, posterUpload };
  } catch (e) {
    await supabase.from("media").update({ status: "failed", error: String(e) }).eq("id", id);
    return { ok: false, error: "Stockage indisponible. Vérifiez la configuration du bucket." };
  }
}

/**
 * Étape 2 : après l'upload direct, génère les variantes (images) et marque le
 * média prêt. Le serveur lit l'original depuis le stockage, jamais depuis le client.
 */
export async function finalizeMedia(mediaId: string): Promise<{ ok: true; media: MediaItem } | { ok: false; error: string }> {
  const parsed = z.uuid().safeParse(mediaId);
  if (!parsed.success) return { ok: false, error: "Identifiant invalide." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée." };
  const { data: row } = await supabase.from("media").select("*").eq("id", mediaId).maybeSingle();
  if (!row) return { ok: false, error: "Média introuvable." };
  if (row.owner_id !== user.id) {
    const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (me?.role !== "editor" && me?.role !== "admin") return { ok: false, error: "Action non autorisée." };
  }
  if (row.status === "ready") return { ok: true, media: toItem(row) };
  if (row.status !== "uploading" && row.status !== "failed" && row.status !== "processing") return { ok: false, error: "Média déjà traité." };

  const storage = getStorage();
  try {
    if (row.kind === "image") {
      await supabase.from("media").update({ status: "processing" }).eq("id", mediaId);
      const original = await storage.getObject(row.original_key);
      const { variants, width, height } = await makeImageVariants(original);
      const keys = {
        thumb: mediaKeys.variant(mediaId, "thumb"),
        medium: mediaKeys.variant(mediaId, "medium"),
        full: mediaKeys.variant(mediaId, "full"),
      };
      await Promise.all([
        storage.putObject(keys.thumb, variants.thumb, "image/webp"),
        storage.putObject(keys.medium, variants.medium, "image/webp"),
        storage.putObject(keys.full, variants.full, "image/webp"),
      ]);
      const { data, error: updateError } = await supabase
        .from("media")
        .update({ status: "ready", variants: keys, width, height, error: null })
        .eq("id", mediaId)
        .select("*")
        .single();
      if (updateError || !data) throw new Error(updateError?.message ?? "mise à jour refusée");
      // L'original (EXIF, GPS, poids) n'est plus servi : la variante « full » (2400 px) le remplace.
      storage.deleteObjects([row.original_key]).catch(() => {});
      return { ok: true, media: toItem(data) };
    }

    // Vidéo : l'index (moov) passe en tête de fichier pour une lecture
    // immédiate en flux (les vidéos iPhone le placent en fin de fichier).
    await supabase.from("media").update({ status: "processing" }).eq("id", mediaId);
    try {
      const original = await storage.getObject(row.original_key);
      const fixed = faststart(original);
      if (fixed) await storage.putObject(row.original_key, fixed, row.mime || "video/mp4");
    } catch (e) {
      console.error("faststart", e);
    }
    const { data, error: updateError } = await supabase
      .from("media")
      .update({ status: "ready", error: null })
      .eq("id", mediaId)
      .select("*")
      .single();
    if (updateError || !data) throw new Error(updateError?.message ?? "mise à jour refusée");
    return { ok: true, media: toItem(data) };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await supabase.from("media").update({ status: "failed", error: message.slice(0, 500) }).eq("id", mediaId);
    return { ok: false, error: "Traitement impossible : " + message };
  }
}

/**
 * Supprime un média retiré dans un éditeur, s'il n'est rattaché à rien
 * (publication, couverture, story, série, à la une). Propriétaire ou éditeur
 * uniquement ; la ligne est supprimée avant les fichiers (RLS = garde-fou).
 */
export async function discardMedia(mediaId: string) {
  if (!z.uuid().safeParse(mediaId).success) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { data: row } = await supabase.from("media").select("*").eq("id", mediaId).maybeSingle();
  if (!row) return;
  if (row.owner_id !== user.id) {
    const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (me?.role !== "editor" && me?.role !== "admin") return;
  }
  const [pm, cover, story, series, highlight] = await Promise.all([
    supabase.from("post_media").select("post_id", { count: "exact", head: true }).eq("media_id", mediaId),
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("cover_media_id", mediaId),
    supabase.from("stories").select("id", { count: "exact", head: true }).eq("media_id", mediaId),
    supabase.from("story_series").select("id", { count: "exact", head: true }).eq("cover_media_id", mediaId),
    supabase.from("story_highlights").select("id", { count: "exact", head: true }).eq("cover_media_id", mediaId),
  ]);
  if ([pm, cover, story, series, highlight].some((r) => (r.count ?? 0) > 0)) return;

  const { error } = await supabase.from("media").delete().eq("id", mediaId);
  if (error) return;
  const variants = (row.variants ?? {}) as Record<string, string>;
  const prefix = new RegExp(`^(originals|variants|posters|videos)/${mediaId}`);
  const keys = [row.original_key, row.poster_key, ...Object.values(variants)].filter((k): k is string => typeof k === "string" && prefix.test(k));
  try {
    await getStorage().deleteObjects(keys);
  } catch {
    /* le fichier orphelin sera nettoyé par la purge quotidienne */
  }
}

function toItem(row: Tables<"media">): MediaItem {
  return {
    id: row.id,
    kind: row.kind,
    variants: (row.variants ?? {}) as MediaItem["variants"],
    poster_key: row.poster_key,
    width: row.width,
    height: row.height,
    alt: row.alt,
    mime: row.mime,
    original_key: row.original_key,
    duration_s: row.duration_s,
  };
}
