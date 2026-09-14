"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { storySchema } from "@/lib/validation/story";
import { friendlyDbError } from "@/lib/validation/comment";

export type StoryFormState = { status: "idle" } | { status: "error"; message: string; fields?: Record<string, string> };
type Result = { ok: true } | { ok: false; error: string };

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !fields[key]) fields[key] = issue.message;
  }
  return fields;
}

function friendlyStoryError(message: string) {
  if (message.includes("VIDEO_TROP_LONGUE")) return "Une story vidéo dure 30 s au plus.";
  return friendlyDbError(message);
}

const revalidate = () => {
  revalidatePath("/");
  revalidatePath("/studio/stories");
};

/** Crée ou met à jour une story (brouillon, programmation ou publication). */
export async function saveStory(_prev: StoryFormState, formData: FormData): Promise<StoryFormState> {
  const parsed = storySchema.safeParse({
    id: formData.get("id") ?? "",
    series_id: formData.get("series_id") ?? "",
    series_title: formData.get("series_title") ?? "",
    media_id: formData.get("media_id") ?? "",
    overlay_text: formData.get("overlay_text") ?? "",
    overlay_position: formData.get("overlay_position") ?? "bottom",
    link_post_id: formData.get("link_post_id") ?? "",
    display_seconds: formData.get("display_seconds") ?? 7,
    expires_hours: formData.get("expires_hours") ?? 48,
    action: formData.get("action") ?? "draft",
    scheduled_at: formData.get("scheduled_at") ?? "",
  });
  if (!parsed.success) {
    const fields = fieldErrors(parsed.error.issues);
    return { status: "error", message: fields.media ?? fields.series_title ?? "Vérifiez les champs signalés.", fields };
  }
  const v = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Série : existante ou créée à la volée
  let seriesId = v.series_id;
  if (!seriesId && v.series_title) {
    const { data: existing } = await supabase.from("story_series").select("id").ilike("title", v.series_title).maybeSingle();
    if (existing) seriesId = existing.id;
    else {
      const { data: created, error } = await supabase.from("story_series").insert({ title: v.series_title, created_by: user.id }).select("id").single();
      if (error || !created) return { status: "error", message: friendlyDbError(error?.message) };
      seriesId = created.id;
    }
  }

  if (v.media_id) {
    const { data: media } = await supabase.from("media").select("status").eq("id", v.media_id).maybeSingle();
    if (media?.status !== "ready" && v.action !== "draft") {
      return { status: "error", message: "Attendez la fin du traitement du média avant de publier.", fields: { media: "Média en cours de traitement." } };
    }
  }

  const status: "published" | "scheduled" | "draft" = v.action === "publish" ? "published" : v.action === "schedule" ? "scheduled" : "draft";
  const scheduledAt = status === "scheduled" ? new Date(v.scheduled_at!) : null;
  const base = status === "published" ? new Date() : scheduledAt;
  const expiresAt = base ? new Date(base.getTime() + v.expires_hours * 3600_000).toISOString() : null;

  const row = {
    series_id: seriesId!,
    media_id: v.media_id!,
    overlay: v.overlay_text ? { text: v.overlay_text, position: v.overlay_position } : null,
    link_post_id: v.link_post_id,
    display_seconds: v.display_seconds,
    status,
    scheduled_at: scheduledAt?.toISOString() ?? null,
    expires_at: expiresAt,
    ...(status !== "published" ? { published_at: null } : {}),
  };

  // Un brouillon peut ne pas encore avoir de média : media_id est obligatoire en base,
  // on refuse donc l'enregistrement sans média même en brouillon.
  if (!v.media_id) return { status: "error", message: "Ajoutez une photo ou une vidéo avant d'enregistrer.", fields: { media: "Média requis." } };

  if (v.id) {
    const { error } = await supabase.from("stories").update(row).eq("id", v.id);
    if (error) return { status: "error", message: friendlyStoryError(error.message) };
  } else {
    const { count } = await supabase.from("stories").select("id", { count: "exact", head: true }).eq("series_id", seriesId!);
    const { error } = await supabase.from("stories").insert({ ...row, author_id: user.id, position: count ?? 0 });
    if (error) return { status: "error", message: friendlyStoryError(error.message) };
  }

  revalidate();
  redirect(`/studio/stories?ok=${status}`);
}

/** Retire une story du bandeau immédiatement (elle reste dans l'archive). */
export async function expireStory(id: string): Promise<Result> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Identifiant invalide." };
  const supabase = await createClient();
  const { error } = await supabase.from("stories").update({ status: "expired", expires_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidate();
  return { ok: true };
}

/** Remet en ligne une story archivée pour une nouvelle durée. */
export async function republishStory(id: string, hours: number): Promise<Result> {
  if (!z.uuid().safeParse(id).success || hours < 1 || hours > 168) return { ok: false, error: "Valeur invalide." };
  const supabase = await createClient();
  const now = new Date();
  const { error } = await supabase
    .from("stories")
    .update({ status: "published", published_at: now.toISOString(), expires_at: new Date(now.getTime() + hours * 3600_000).toISOString(), scheduled_at: null })
    .eq("id", id);
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidate();
  return { ok: true };
}

export async function deleteStory(id: string): Promise<Result> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Identifiant invalide." };
  const supabase = await createClient();
  const { error } = await supabase.from("stories").delete().eq("id", id);
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidate();
  return { ok: true };
}

// ---- À la une ---------------------------------------------------------------

export async function createHighlight(title: string): Promise<Result> {
  const t = title.trim();
  if (t.length < 1 || t.length > 80) return { ok: false, error: "Titre entre 1 et 80 caractères." };
  const supabase = await createClient();
  const { count } = await supabase.from("story_highlights").select("id", { count: "exact", head: true });
  const { error } = await supabase.from("story_highlights").insert({ title: t, position: count ?? 0 });
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidate();
  return { ok: true };
}

export async function renameHighlight(id: string, title: string): Promise<Result> {
  const t = title.trim();
  if (!z.uuid().safeParse(id).success || t.length < 1 || t.length > 80) return { ok: false, error: "Valeur invalide." };
  const supabase = await createClient();
  const { error } = await supabase.from("story_highlights").update({ title: t }).eq("id", id);
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidate();
  return { ok: true };
}

export async function setHighlightActive(id: string, active: boolean): Promise<Result> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Identifiant invalide." };
  const supabase = await createClient();
  const { error } = await supabase.from("story_highlights").update({ is_active: active }).eq("id", id);
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidate();
  return { ok: true };
}

export async function deleteHighlight(id: string): Promise<Result> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Identifiant invalide." };
  const supabase = await createClient();
  const { error } = await supabase.from("story_highlights").delete().eq("id", id);
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidate();
  return { ok: true };
}

export async function toggleStoryInHighlight(storyId: string, highlightId: string, inside: boolean): Promise<Result> {
  if (!z.uuid().safeParse(storyId).success || !z.uuid().safeParse(highlightId).success) return { ok: false, error: "Identifiant invalide." };
  const supabase = await createClient();
  if (inside) {
    const { count } = await supabase.from("story_highlight_items").select("story_id", { count: "exact", head: true }).eq("highlight_id", highlightId);
    const { error } = await supabase.from("story_highlight_items").insert({ highlight_id: highlightId, story_id: storyId, position: count ?? 0 });
    if (error && !error.message.includes("duplicate")) return { ok: false, error: friendlyDbError(error.message) };
  } else {
    const { error } = await supabase.from("story_highlight_items").delete().eq("highlight_id", highlightId).eq("story_id", storyId);
    if (error) return { ok: false, error: friendlyDbError(error.message) };
  }
  revalidate();
  return { ok: true };
}
