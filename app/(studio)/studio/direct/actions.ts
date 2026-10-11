"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, getCurrentUser, isEditorRole } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchNotifications } from "@/lib/notifications/dispatch";
import { friendlyDbError } from "@/lib/validation/comment";
import { fetchLiveEntries } from "@/lib/direct/queries";
import { LIVE_LIMITS, type LiveEntry } from "@/lib/direct/types";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function editor() {
  const current = await getCurrentUser();
  if (!current) return { current: null, supabase: await createClient() };
  if (!isEditorRole(current.profile.role)) return { current: null, supabase: await createClient() };
  return { current, supabase: await createClient() };
}

function revalidate() {
  revalidatePath("/");
  revalidatePath("/studio/direct");
}

const createSchema = z.object({
  title: z.string().trim().min(1, "Donnez un titre au direct.").max(LIVE_LIMITS.titleMax, "Titre trop long (120 caractères)."),
  location: z.string().trim().max(LIVE_LIMITS.locationMax, "Lieu trop long (160 caractères).").transform((s) => s || null),
  center_id: z.string().uuid().nullable().optional(),
  video: z.boolean(),
});

/** Crée un Direct en brouillon (service communication). */
export async function createLive(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Vérifiez les champs." };
  const { current, supabase } = await editor();
  if (!current) return { ok: false, error: "Réservé au service communication." };
  const { data, error } = await supabase
    .from("lives")
    .insert({ title: parsed.data.title, location: parsed.data.location, center_id: parsed.data.center_id ?? null, video: parsed.data.video, created_by: current.user.id })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: friendlyDbError(error?.message) };
  revalidate();
  return { ok: true, id: data.id };
}

/** Lance le Direct : épinglé en tête du fil, notification et push à tous. Un seul actif à la fois. */
export async function startLive(id: string): Promise<Result> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Identifiant invalide." };
  const { current, supabase } = await editor();
  if (!current) return { ok: false, error: "Réservé au service communication." };
  const { data: other } = await supabase.from("lives").select("id, title").eq("status", "live").is("deleted_at", null).neq("id", id).maybeSingle();
  if (other) return { ok: false, error: `Un direct est déjà en cours : « ${other.title} ». Terminez-le d'abord.` };
  const { error } = await supabase.from("lives").update({ status: "live", started_at: new Date().toISOString() }).eq("id", id).eq("status", "draft");
  if (error) return { ok: false, error: /lives_single_active/.test(error.message) ? "Un direct est déjà en cours." : friendlyDbError(error.message) };
  after(async () => {
    try {
      await dispatchNotifications(50);
    } catch (e) {
      console.error("dispatch", e);
    }
  });
  revalidate();
  revalidatePath(`/direct/${id}`);
  return { ok: true };
}

const entrySchema = z.object({
  live_id: z.uuid(),
  body: z.string().trim().max(LIVE_LIMITS.entryMax, "Texte trop long (600 caractères).").transform((s) => s || null),
  media_id: z.uuid().nullable().optional(),
});

/** Ajoute une entrée (texte, photo ou les deux) ; les lecteurs la reçoivent en temps réel. */
export async function addLiveEntry(input: unknown): Promise<Result<{ entry: LiveEntry }>> {
  const parsed = entrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrée invalide." };
  const v = parsed.data;
  if (!v.body && !v.media_id) return { ok: false, error: "Écrivez un texte ou ajoutez une photo." };
  const { current, supabase } = await editor();
  if (!current) return { ok: false, error: "Réservé au service communication." };
  const { data: live } = await supabase.from("lives").select("status").eq("id", v.live_id).maybeSingle();
  if (!live || live.status === "ended") return { ok: false, error: "Ce direct est terminé." };
  const { data, error } = await supabase.from("live_entries").insert({ live_id: v.live_id, body: v.body, media_id: v.media_id ?? null, author_id: current.user.id }).select("id").single();
  if (error || !data) return { ok: false, error: friendlyDbError(error?.message) };
  const entries = await fetchLiveEntries(v.live_id, 1);
  const entry = entries.find((e) => e.id === data.id) ?? entries[0];
  revalidatePath("/");
  return { ok: true, entry };
}

export async function deleteLiveEntry(id: string): Promise<Result> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Identifiant invalide." };
  const { current, supabase } = await editor();
  if (!current) return { ok: false, error: "Réservé au service communication." };
  const { error } = await supabase.from("live_entries").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidatePath("/");
  return { ok: true };
}

export async function pinLiveEntry(id: string, pinned: boolean): Promise<Result> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Identifiant invalide." };
  const { current, supabase } = await editor();
  if (!current) return { ok: false, error: "Réservé au service communication." };
  const { error } = await supabase.from("live_entries").update({ pinned }).eq("id", id);
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  return { ok: true };
}

/** Entrées d'un Direct (sondage temps réel côté lecteur). */
export async function listLiveEntries(liveId: string): Promise<LiveEntry[]> {
  if (!z.uuid().safeParse(liveId).success) return [];
  return fetchLiveEntries(liveId);
}

/**
 * Termine le Direct et génère la publication récapitulative : chronologie des entrées,
 * photos en carrousel (type « photo ») ou texte seul, publiée tout de suite.
 */
export async function endLive(id: string): Promise<Result<{ postId: string | null }>> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Identifiant invalide." };
  const { current, supabase } = await editor();
  if (!current) return { ok: false, error: "Réservé au service communication." };
  const { data: live } = await supabase.from("lives").select("id, title, location, center_id, started_at, status, recap_post_id").eq("id", id).maybeSingle();
  if (!live) return { ok: false, error: "Direct introuvable." };
  if (live.status === "ended") return { ok: true, postId: live.recap_post_id };
  const entries = (await fetchLiveEntries(id, 500)).reverse(); // chronologique
  const fmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  const lines = entries.filter((e) => e.body).map((e) => `${fmt.format(new Date(e.created_at))} — ${e.body}`);
  const photos = entries.filter((e) => e.media && e.media.kind === "image").map((e) => e.media!);
  const started = live.started_at ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(live.started_at)) : null;
  const intro = `Récapitulatif du direct${started ? ` du ${started}` : ""}${live.location ? ` · ${live.location}` : ""}.`;
  const body = [intro, "", ...lines].join("\n").slice(0, 20_000);
  const admin = createAdminClient();
  let postId: string | null = null;
  const { data: post, error: postErr } = await admin
    .from("posts")
    .insert({ type: photos.length > 0 ? "photo" : "text", title: live.title, location: live.location, body, status: "published", published_at: new Date().toISOString(), author_id: current.user.id, author_display: "service_com", comments_enabled: true, reactions_enabled: true, center_id: null })
    .select("id")
    .single();
  if (postErr || !post) return { ok: false, error: friendlyDbError(postErr?.message) };
  postId = post.id;
  if (photos.length > 0) {
    const { error: pmErr } = await admin.from("post_media").insert(photos.slice(0, 30).map((m, i) => ({ post_id: postId!, media_id: m.id, position: i, alt: m.alt || null, caption: entries.find((e) => e.media?.id === m.id)?.body ?? null })));
    if (pmErr) console.error("récapitulatif photos", pmErr.message);
  }
  const { error } = await supabase.from("lives").update({ status: "ended", ended_at: new Date().toISOString(), recap_post_id: postId }).eq("id", id);
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  after(async () => {
    try {
      await dispatchNotifications(50);
    } catch (e) {
      console.error("dispatch", e);
    }
  });
  revalidate();
  revalidatePath(`/direct/${id}`);
  return { ok: true, postId };
}

export async function deleteLive(id: string): Promise<Result> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Identifiant invalide." };
  const { current, supabase } = await editor();
  if (!current) return { ok: false, error: "Réservé au service communication." };
  const { error } = await supabase.from("lives").update({ deleted_at: new Date().toISOString(), status: "ended" }).eq("id", id);
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidate();
  return { ok: true };
}

export type LiveStreamConfig = { configured: boolean; rtmpUrl: string | null; streamKey: string | null; hlsUrl: string | null };

/** Paramètres de diffusion Bunny (RTMP, clé) : service communication seulement, jamais exposés aux agents. */
export async function liveStreamConfig(): Promise<LiveStreamConfig> {
  const { current } = await editor();
  if (!current) return { configured: false, rtmpUrl: null, streamKey: null, hlsUrl: null };
  const rtmpUrl = process.env.LIVE_RTMP_URL ?? null;
  const streamKey = process.env.LIVE_STREAM_KEY ?? null;
  const hlsUrl = process.env.NEXT_PUBLIC_LIVE_HLS_URL ?? null;
  return { configured: Boolean(rtmpUrl && streamKey && hlsUrl), rtmpUrl, streamKey, hlsUrl };
}
