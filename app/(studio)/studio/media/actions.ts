"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getStorage } from "@/lib/storage";
import { extensionFor, mediaKeys } from "@/lib/media/keys";
import { makeImageVariants } from "@/lib/media/variants";
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
    if (v.size > LIMITS.imageMaxBytes) return { ok: false, error: "Image trop lourde (30 Mo max)." };
  } else {
    if (v.mime !== "video/mp4") return { ok: false, error: "Seules les vidéos MP4 H.264 sont acceptées." };
    if (v.size > LIMITS.videoMaxBytes) return { ok: false, error: "Vidéo trop lourde (200 Mo max)." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée." };

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
  const { data: row } = await supabase.from("media").select("*").eq("id", mediaId).maybeSingle();
  if (!row) return { ok: false, error: "Média introuvable." };

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
      const { data } = await supabase
        .from("media")
        .update({ status: "ready", variants: keys, width, height, error: null })
        .eq("id", mediaId)
        .select("*")
        .single();
      return { ok: true, media: toItem(data ?? { ...row, status: "ready", variants: keys, width, height }) };
    }

    const { data } = await supabase
      .from("media")
      .update({ status: "ready", error: null })
      .eq("id", mediaId)
      .select("*")
      .single();
    return { ok: true, media: toItem(data ?? { ...row, status: "ready" }) };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await supabase.from("media").update({ status: "failed", error: message.slice(0, 500) }).eq("id", mediaId);
    return { ok: false, error: "Traitement impossible : " + message };
  }
}

/** Met à jour le texte alternatif d'un média (éditeur). */
export async function updateMediaAlt(mediaId: string, alt: string) {
  const supabase = await createClient();
  await supabase.from("media").update({ alt: alt.slice(0, 300) }).eq("id", mediaId);
}

/** Supprime un média non rattaché à une publication (ménage après retrait dans l'éditeur). */
export async function discardMedia(mediaId: string) {
  const supabase = await createClient();
  const { data: row } = await supabase.from("media").select("*").eq("id", mediaId).maybeSingle();
  if (!row) return;
  const { count } = await supabase.from("post_media").select("post_id", { count: "exact", head: true }).eq("media_id", mediaId);
  if ((count ?? 0) > 0) return;
  const variants = (row.variants ?? {}) as Record<string, string>;
  const keys = [row.original_key, row.poster_key, ...Object.values(variants)].filter(Boolean) as string[];
  try {
    await getStorage().deleteObjects(keys);
  } catch {
    /* le fichier orphelin sera nettoyé plus tard */
  }
  await supabase.from("media").delete().eq("id", mediaId);
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
