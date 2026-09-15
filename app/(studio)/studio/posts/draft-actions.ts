"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/validation/comment";

type Result = { ok: true } | { ok: false; error: string };
const LOCK_TTL_MS = 10 * 60_000;

export type LockInfo = { locked_by: { id: string; name: string } | null; lock_at: string | null; mine: boolean; stale: boolean };
export type ReviewInfo = {
  status: "none" | "requested" | "approved" | "returned";
  requested_to: { id: string; name: string } | null;
  requested_by: { id: string; name: string } | null;
  requested_at: string | null;
  decided_by: { id: string; name: string } | null;
  decided_at: string | null;
};
export type ReviewComment = { id: number; body: string; created_at: string; resolved_at: string | null; author: { id: string; name: string } | null };
export type VersionRow = { version: number; saved_at: string; saved_by: { name: string } | null; snapshot: { title: string | null; body: string | null; excerpt: string | null; location: string | null; tags: string[] } };

async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

const PERSON = "id, first_name, last_name";
const name = (p: { first_name: string; last_name: string } | null | undefined) => (p ? `${p.first_name} ${p.last_name}`.trim() : "");

/** Prend ou rafraîchit le verrou d'édition (toutes les 60 s). Refus si un autre éditeur est actif depuis moins de 10 min, sauf `force`. */
export async function acquireLock(postId: string, force = false): Promise<{ ok: true; lock: LockInfo } | { ok: false; error: string; lock: LockInfo }> {
  if (!z.uuid().safeParse(postId).success) return { ok: false, error: "Identifiant invalide.", lock: { locked_by: null, lock_at: null, mine: false, stale: false } };
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Session expirée.", lock: { locked_by: null, lock_at: null, mine: false, stale: false } };
  const { data: row } = await supabase.from("posts").select(`lock_by, lock_at, locker:profiles!posts_lock_by_fkey(${PERSON})`).eq("id", postId).maybeSingle();
  if (!row) return { ok: false, error: "Publication introuvable.", lock: { locked_by: null, lock_at: null, mine: false, stale: false } };
  const locker = row.locker as unknown as { id: string; first_name: string; last_name: string } | null;
  const age = row.lock_at ? Date.now() - new Date(row.lock_at).getTime() : Infinity;
  const stale = age > LOCK_TTL_MS;
  const held = row.lock_by && row.lock_by !== user.id && !stale;
  if (held && !force) {
    return { ok: false, error: "Modifié par un autre éditeur.", lock: { locked_by: locker ? { id: locker.id, name: name(locker) } : null, lock_at: row.lock_at, mine: false, stale } };
  }
  const { error } = await supabase.from("posts").update({ lock_by: user.id, lock_at: new Date().toISOString() }).eq("id", postId);
  if (error) return { ok: false, error: friendlyDbError(error.message), lock: { locked_by: null, lock_at: null, mine: false, stale: false } };
  return { ok: true, lock: { locked_by: { id: user.id, name: "vous" }, lock_at: new Date().toISOString(), mine: true, stale: false } };
}

export async function releaseLock(postId: string): Promise<void> {
  if (!z.uuid().safeParse(postId).success) return;
  const { supabase, user } = await me();
  if (!user) return;
  await supabase.from("posts").update({ lock_by: null, lock_at: null }).eq("id", postId).eq("lock_by", user.id);
}

const autosaveSchema = z.object({
  title: z.string().max(200),
  location: z.string().max(120),
  excerpt: z.string().max(500),
  body: z.string().max(50000),
});

/** Sauvegarde automatique (contenu texte seulement, statut inchangé), toutes les 5 s quand le brouillon change. */
export async function autosavePost(postId: string, input: unknown): Promise<{ ok: true; at: string } | { ok: false; error: string }> {
  if (!z.uuid().safeParse(postId).success) return { ok: false, error: "Identifiant invalide." };
  const parsed = autosaveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Contenu invalide." };
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Session expirée." };
  const v = parsed.data;
  const at = new Date().toISOString();
  const { error } = await supabase
    .from("posts")
    .update({ title: v.title || null, location: v.location || null, excerpt: v.excerpt || null, body: v.body || null, autosave_at: at, lock_by: user.id, lock_at: at })
    .eq("id", postId);
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  return { ok: true, at };
}

export async function listVersions(postId: string): Promise<VersionRow[]> {
  if (!z.uuid().safeParse(postId).success) return [];
  const { supabase } = await me();
  const { data } = await supabase.from("post_versions").select(`version, saved_at, snapshot, saved_by:profiles!post_versions_saved_by_fkey(first_name, last_name)`).eq("post_id", postId).order("version", { ascending: false }).limit(30);
  return ((data ?? []) as unknown as { version: number; saved_at: string; snapshot: VersionRow["snapshot"]; saved_by: { first_name: string; last_name: string } | null }[]).map((r) => ({
    version: r.version,
    saved_at: r.saved_at,
    saved_by: r.saved_by ? { name: name(r.saved_by) } : null,
    snapshot: r.snapshot,
  }));
}

/** Restaure une version (le contenu courant est lui-même versionné par le trigger). */
export async function restoreVersion(postId: string, version: number): Promise<Result> {
  if (!z.uuid().safeParse(postId).success || !Number.isInteger(version)) return { ok: false, error: "Identifiant invalide." };
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Session expirée." };
  const { data: v } = await supabase.from("post_versions").select("snapshot").eq("post_id", postId).eq("version", version).maybeSingle();
  if (!v) return { ok: false, error: "Version introuvable." };
  const s = v.snapshot as VersionRow["snapshot"];
  const { error } = await supabase.from("posts").update({ title: s.title, location: s.location, excerpt: s.excerpt, body: s.body, tags: s.tags ?? [] }).eq("id", postId);
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidatePath(`/studio/posts/${postId}`);
  return { ok: true };
}

export async function listEditors(): Promise<{ id: string; name: string; role: string }[]> {
  const { supabase, user } = await me();
  const { data } = await supabase.from("profiles").select(`${PERSON}, role`).in("role", ["editor", "admin"]).eq("is_active", true).order("last_name");
  return ((data ?? []) as { id: string; first_name: string; last_name: string; role: string }[]).filter((p) => p.id !== user?.id).map((p) => ({ id: p.id, name: name(p), role: p.role }));
}

export async function getReview(postId: string): Promise<{ review: ReviewInfo; comments: ReviewComment[] } | null> {
  if (!z.uuid().safeParse(postId).success) return null;
  const { supabase } = await me();
  const [{ data: p }, { data: comments }] = await Promise.all([
    supabase
      .from("posts")
      .select(`review_status, review_requested_at, review_decided_at, to:profiles!posts_review_requested_to_fkey(${PERSON}), by:profiles!posts_review_requested_by_fkey(${PERSON}), decided:profiles!posts_review_decided_by_fkey(${PERSON})`)
      .eq("id", postId)
      .maybeSingle(),
    supabase.from("post_review_comments").select(`id, body, created_at, resolved_at, author:profiles!post_review_comments_author_id_fkey(${PERSON})`).eq("post_id", postId).order("created_at"),
  ]);
  if (!p) return null;
  type P = { id: string; first_name: string; last_name: string } | null;
  const row = p as unknown as { review_status: ReviewInfo["status"]; review_requested_at: string | null; review_decided_at: string | null; to: P; by: P; decided: P };
  const ref = (x: P) => (x ? { id: x.id, name: name(x) } : null);
  return {
    review: { status: row.review_status, requested_to: ref(row.to), requested_by: ref(row.by), requested_at: row.review_requested_at, decided_by: ref(row.decided), decided_at: row.review_decided_at },
    comments: ((comments ?? []) as unknown as { id: number; body: string; created_at: string; resolved_at: string | null; author: P }[]).map((c) => ({ ...c, author: ref(c.author) })),
  };
}

/** Demande une relecture à un éditeur : la publication ne peut plus être mise en ligne avant validation (sauf administrateur). */
export async function requestReview(postId: string, reviewerId: string, message: string): Promise<Result> {
  if (!z.uuid().safeParse(postId).success || !z.uuid().safeParse(reviewerId).success) return { ok: false, error: "Identifiant invalide." };
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Session expirée." };
  const { error } = await supabase.from("posts").update({ review_status: "requested", review_requested_to: reviewerId }).eq("id", postId);
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  const text = message.trim().slice(0, 2000);
  if (text) await supabase.from("post_review_comments").insert({ post_id: postId, author_id: user.id, body: text });
  revalidatePath(`/studio/posts/${postId}`);
  return { ok: true };
}

/** Valide ou renvoie une relecture (tout éditeur). */
export async function decideReview(postId: string, decision: "approved" | "returned", message: string): Promise<Result> {
  if (!z.uuid().safeParse(postId).success) return { ok: false, error: "Identifiant invalide." };
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Session expirée." };
  const text = message.trim().slice(0, 2000);
  if (text) await supabase.from("post_review_comments").insert({ post_id: postId, author_id: user.id, body: text });
  const { error } = await supabase.from("posts").update({ review_status: decision }).eq("id", postId);
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  revalidatePath(`/studio/posts/${postId}`);
  return { ok: true };
}

export async function addReviewComment(postId: string, body: string): Promise<Result> {
  if (!z.uuid().safeParse(postId).success) return { ok: false, error: "Identifiant invalide." };
  const text = body.trim().slice(0, 2000);
  if (!text) return { ok: false, error: "Commentaire vide." };
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Session expirée." };
  const { error } = await supabase.from("post_review_comments").insert({ post_id: postId, author_id: user.id, body: text });
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  return { ok: true };
}

export async function resolveReviewComment(id: number): Promise<Result> {
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Session expirée." };
  const { error } = await supabase.from("post_review_comments").update({ resolved_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: friendlyDbError(error.message) };
  return { ok: true };
}
