"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getStorage } from "@/lib/storage";
import { mediaKeys } from "@/lib/media/keys";
import { getVideoProvider } from "@/lib/video/provider";
import { parseVtt, serializeVtt, type Cue } from "@/lib/video/vtt";

type Result = { ok: true } | { ok: false; error: string };

export type VideoState = {
  video_status: "uploaded" | "processing" | "ready" | "failed" | null;
  video_error: string | null;
  renditions: { height: number }[];
  pending: number;
  poster_key: string | null;
  poster_source: "auto" | "upload" | "timecode";
  poster_time_s: number | null;
  duration_s: number | null;
  orientation: "portrait" | "landscape" | "square" | null;
  subtitles: { cues: Cue[]; status: "draft" | "published"; source: "upload" | "auto" | "manual" } | null;
  transcription_enabled: boolean;
};

async function requireOwnerOrEditor(mediaId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, media: null, error: "Session expirée." };
  const { data: media } = await supabase.from("media").select("*").eq("id", mediaId).maybeSingle();
  if (!media || media.kind !== "video") return { supabase, user, media: null, error: "Vidéo introuvable." };
  if (media.owner_id !== user.id) {
    const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (me?.role !== "editor" && me?.role !== "admin") return { supabase, user, media: null, error: "Action non autorisée." };
  }
  return { supabase, user, media, error: null };
}

/** État du transcodage et des sous-titres (sondé par le studio pendant le traitement). */
export async function getVideoState(mediaId: string): Promise<VideoState | null> {
  if (!z.uuid().safeParse(mediaId).success) return null;
  const { supabase, media } = await requireOwnerOrEditor(mediaId);
  if (!media) return null;
  const { data: sub } = await supabase.from("media_subtitles").select("cues, status, source").eq("media_id", mediaId).eq("lang", "fr").maybeSingle();
  const { pendingRenditions } = await import("@/lib/video/transcode");
  return {
    video_status: media.video_status,
    video_error: media.video_error,
    renditions: (media.renditions as { height: number }[]) ?? [],
    pending: media.video_status === "ready" || media.video_status === "processing" ? pendingRenditions(media).length : 0,
    poster_key: media.poster_key,
    poster_source: media.poster_source,
    poster_time_s: media.poster_time_s,
    duration_s: media.duration_s,
    orientation: media.orientation,
    subtitles: sub ? { cues: (sub.cues as Cue[]) ?? [], status: sub.status, source: sub.source } : null,
    transcription_enabled: Boolean(process.env.TRANSCRIPTION_API_KEY),
  };
}

/** Remet la vidéo en file (« Relancer ») : le client appelle ensuite /api/video/transcode. */
export async function resetVideoJob(mediaId: string): Promise<Result> {
  if (!z.uuid().safeParse(mediaId).success) return { ok: false, error: "Identifiant invalide." };
  const { supabase, media, error } = await requireOwnerOrEditor(mediaId);
  if (!media) return { ok: false, error: error! };
  await supabase.from("media").update({ video_status: "uploaded", video_error: null, transcode_attempts: 0 }).eq("id", mediaId);
  return { ok: true };
}

/** Poster : image envoyée (média image déjà « ready ») ou image extraite à un timecode. */
export async function setPoster(mediaId: string, input: { imageMediaId?: string; timeS?: number }): Promise<Result> {
  if (!z.uuid().safeParse(mediaId).success) return { ok: false, error: "Identifiant invalide." };
  const { supabase, media, error } = await requireOwnerOrEditor(mediaId);
  if (!media) return { ok: false, error: error! };
  const storage = getStorage();
  try {
    if (input.imageMediaId) {
      if (!z.uuid().safeParse(input.imageMediaId).success) return { ok: false, error: "Image invalide." };
      const { data: img } = await supabase.from("media").select("variants, status, kind").eq("id", input.imageMediaId).maybeSingle();
      const key = (img?.variants as { medium?: string; full?: string } | null)?.medium ?? (img?.variants as { full?: string } | null)?.full;
      if (!img || img.kind !== "image" || img.status !== "ready" || !key) return { ok: false, error: "Image non prête." };
      const bytes = await storage.getObject(key);
      await storage.putObject(mediaKeys.poster(mediaId), bytes, "image/webp");
      await supabase.from("media").update({ poster_key: mediaKeys.poster(mediaId), poster_source: "upload", poster_time_s: null }).eq("id", mediaId);
    } else if (typeof input.timeS === "number" && Number.isFinite(input.timeS)) {
      const t = Math.max(0, Math.min(input.timeS, Number(media.duration_s ?? 0) || input.timeS));
      const provider = await getVideoProvider();
      const jpeg = await provider.frameAt(mediaId, t);
      await storage.putObject(mediaKeys.poster(mediaId), jpeg, "image/jpeg");
      await supabase.from("media").update({ poster_key: mediaKeys.poster(mediaId), poster_source: "timecode", poster_time_s: t }).eq("id", mediaId);
    } else return { ok: false, error: "Choisissez une image ou un instant." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Poster impossible." };
  }
  revalidatePath("/");
  return { ok: true };
}

const cueSchema = z.object({ start: z.number().min(0), end: z.number().min(0), text: z.string().trim().max(300) });

/** Importe un fichier .vtt / .srt (texte) en brouillon éditable. */
export async function importSubtitles(mediaId: string, text: string): Promise<{ ok: true; cues: Cue[] } | { ok: false; error: string }> {
  if (!z.uuid().safeParse(mediaId).success) return { ok: false, error: "Identifiant invalide." };
  const { supabase, user, media, error } = await requireOwnerOrEditor(mediaId);
  if (!media) return { ok: false, error: error! };
  const cues = parseVtt(String(text ?? "").slice(0, 500_000));
  if (cues.length === 0) return { ok: false, error: "Aucun sous-titre lisible dans ce fichier (WebVTT ou SRT attendu)." };
  const { error: dbError } = await supabase.from("media_subtitles").upsert({ media_id: mediaId, lang: "fr", source: "upload", cues, status: "draft", updated_by: user!.id }, { onConflict: "media_id,lang" });
  if (dbError) return { ok: false, error: "Enregistrement impossible." };
  return { ok: true, cues };
}

/** Enregistre les lignes éditées (brouillon) et, si demandé, publie le fichier VTT. */
export async function saveSubtitles(mediaId: string, cues: unknown, publish: boolean): Promise<Result> {
  if (!z.uuid().safeParse(mediaId).success) return { ok: false, error: "Identifiant invalide." };
  const parsed = z.array(cueSchema).max(2000).safeParse(cues);
  if (!parsed.success) return { ok: false, error: "Sous-titres invalides." };
  const { supabase, user, media, error } = await requireOwnerOrEditor(mediaId);
  if (!media) return { ok: false, error: error! };
  const clean = parsed.data.filter((c) => c.text && c.end > c.start);
  let vtt_key: string | null = null;
  if (publish) {
    if (clean.length === 0) return { ok: false, error: "Aucune ligne à publier." };
    vtt_key = mediaKeys.subtitles(mediaId, "fr");
    try {
      await getStorage().putObject(vtt_key, Buffer.from(serializeVtt(clean), "utf8"), "text/vtt; charset=utf-8");
    } catch {
      return { ok: false, error: "Fichier de sous-titres non enregistré : réessayez dans un instant." };
    }
  }
  const { data: existing } = await supabase.from("media_subtitles").select("source").eq("media_id", mediaId).eq("lang", "fr").maybeSingle();
  const { error: dbError } = await supabase
    .from("media_subtitles")
    .upsert({ media_id: mediaId, lang: "fr", source: existing?.source ?? "manual", cues: clean, status: publish ? "published" : "draft", vtt_key: publish ? vtt_key : null, updated_by: user!.id }, { onConflict: "media_id,lang" });
  if (dbError) return { ok: false, error: "Enregistrement impossible." };
  revalidatePath("/");
  return { ok: true };
}

export async function removeSubtitles(mediaId: string): Promise<Result> {
  if (!z.uuid().safeParse(mediaId).success) return { ok: false, error: "Identifiant invalide." };
  const { supabase, media, error } = await requireOwnerOrEditor(mediaId);
  if (!media) return { ok: false, error: error! };
  await supabase.from("media_subtitles").delete().eq("media_id", mediaId).eq("lang", "fr");
  getStorage()
    .deleteObjects([mediaKeys.subtitles(mediaId, "fr")])
    .catch(() => {});
  revalidatePath("/");
  return { ok: true };
}
