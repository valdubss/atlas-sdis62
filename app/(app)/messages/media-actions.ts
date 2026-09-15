"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getStorage } from "@/lib/storage";
import { mediaKeys, extensionFor } from "@/lib/media/keys";
import { FILE_MIMES, MESSAGE_LIMITS } from "@/lib/messages/helpers";
import { makeImageVariants } from "@/lib/media/variants";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const signSchema = z.object({
  channel_id: z.uuid(),
  kind: z.enum(["image", "video", "file", "voice", "photo"]),
  mime: z.string().max(100),
  size: z.number().int().positive(),
  name: z.string().max(200).optional(),
});

const AUDIO_MIMES = ["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/wav", "audio/aac", "audio/x-m4a"];

function ext(mime: string, name?: string) {
  const e = extensionFor(mime);
  if (e !== "bin") return e;
  if (mime === "application/pdf") return "pdf";
  if (mime.includes("wordprocessingml")) return "docx";
  if (mime.startsWith("audio/webm")) return "webm";
  if (mime.startsWith("audio/mp4") || mime.includes("m4a")) return "m4a";
  if (mime.startsWith("audio/mpeg")) return "mp3";
  if (mime.startsWith("audio/ogg")) return "ogg";
  if (mime.startsWith("audio/wav")) return "wav";
  const m = /\.([a-z0-9]{2,5})$/i.exec(name ?? "");
  return m ? m[1].toLowerCase() : "bin";
}

/**
 * Signe l'envoi direct d'une pièce jointe de message (membres du canal),
 * sous `messages/<canal>/…` (photo de groupe : `photo`). Limites du brief.
 */
export async function signMessageUpload(input: { channel_id: string; kind: "image" | "video" | "file" | "voice" | "photo"; mime: string; size: number; name?: string }): Promise<Result<{ key: string; url: string; headers: Record<string, string> }>> {
  const parsed = signSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Fichier invalide." };
  const v = parsed.data;
  if ((v.kind === "image" || v.kind === "photo") && !v.mime.startsWith("image/")) return { ok: false, error: "Image attendue." };
  if ((v.kind === "image" || v.kind === "photo") && v.size > MESSAGE_LIMITS.imageMaxBytes) return { ok: false, error: "Photo trop lourde (8 Mo max)." };
  if (v.kind === "video" && (v.mime !== "video/mp4" || v.size > MESSAGE_LIMITS.videoMaxBytes)) return { ok: false, error: "Vidéo MP4 de 50 Mo au plus." };
  if (v.kind === "file" && (!(FILE_MIMES as readonly string[]).includes(v.mime) || v.size > MESSAGE_LIMITS.fileMaxBytes)) return { ok: false, error: "PDF ou Word de 25 Mo au plus." };
  if (v.kind === "voice" && (!AUDIO_MIMES.some((m) => v.mime.startsWith(m)) || v.size > MESSAGE_LIMITS.voiceMaxBytes)) return { ok: false, error: "Message vocal trop long." };

  const supabase = await createClient();
  if (v.kind === "photo") {
    // Photo de groupe : éditeurs seulement, dossier commun (le groupe n'existe pas encore à la création)
    const { data: editor } = await supabase.rpc("is_editor");
    if (!editor) return { ok: false, error: "Action non autorisée." };
    const photoKey = `messages/groups/${randomUUID()}.${ext(v.mime, v.name)}`;
    try {
      const signed = await getStorage().presignUpload(photoKey, v.mime, v.size);
      return { ok: true, key: photoKey, url: signed.url, headers: signed.headers };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Signature impossible." };
    }
  }
  const { data: member } = await supabase.rpc("is_channel_member", { p_channel: v.channel_id });
  if (!member) return { ok: false, error: "Action non autorisée." };
  if (v.kind !== "voice") {
    const { data: channel } = await supabase.from("channels").select("members_can_post_media, read_only, archived_at").eq("id", v.channel_id).maybeSingle();
    if (!channel || channel.read_only || channel.archived_at) return { ok: false, error: "Conversation en lecture seule." };
    if (!channel.members_can_post_media) {
      const { data: editor } = await supabase.rpc("is_editor");
      if (!editor) return { ok: false, error: "Seul le service communication peut envoyer des médias ici." };
    }
  }
  const key = `messages/${v.channel_id}/${randomUUID()}.${ext(v.mime, v.name)}`;
  try {
    const signed = await getStorage().presignUpload(key, v.mime, v.size);
    return { ok: true, key, url: signed.url, headers: signed.headers };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Signature impossible." };
  }
}

/**
 * « Utiliser dans un post » : copie une photo de message dans la bibliothèque
 * du studio (ligne `media` prête, variantes générées). Éditeurs seulement.
 */
export async function importMessageMedia(messageId: string, index: number): Promise<Result<{ mediaId: string }>> {
  if (!z.uuid().safeParse(messageId).success || !Number.isInteger(index) || index < 0) return { ok: false, error: "Identifiant invalide." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée." };
  const { data: editor } = await supabase.rpc("is_editor");
  if (!editor) return { ok: false, error: "Réservé au service communication." };
  const { data: row } = await supabase.from("channel_messages").select("media").eq("id", messageId).maybeSingle();
  const list = (row?.media ?? []) as { key: string; kind: string; mime: string; width?: number | null; height?: number | null }[];
  const item = list[index];
  if (!item || item.kind !== "image") return { ok: false, error: "Seules les photos peuvent rejoindre la bibliothèque." };

  const storage = getStorage();
  try {
    const original = await storage.getObject(item.key);
    const { data: media, error } = await supabase
      .from("media")
      .insert({ owner_id: user.id, kind: "image", status: "processing", mime: item.mime, size_bytes: original.byteLength, original_key: mediaKeys.original(randomUUID(), extensionFor(item.mime)) })
      .select("id, original_key")
      .single();
    if (error || !media) return { ok: false, error: "Création du média impossible." };
    await storage.putObject(media.original_key, original, item.mime);
    const { variants, width, height, lqip } = await makeImageVariants(original);
    const keys = { thumb: mediaKeys.variant(media.id, "thumb"), small: mediaKeys.variant(media.id, "small"), medium: mediaKeys.variant(media.id, "medium"), full: mediaKeys.variant(media.id, "full") };
    await Promise.all([
      storage.putObject(keys.thumb, variants.thumb, "image/webp"),
      storage.putObject(keys.small, variants.small, "image/webp"),
      storage.putObject(keys.medium, variants.medium, "image/webp"),
      storage.putObject(keys.full, variants.full, "image/webp"),
    ]);
    await supabase.from("media").update({ status: "ready", variants: keys, width, height, lqip }).eq("id", media.id);
    return { ok: true, mediaId: media.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Import impossible." };
  }
}
