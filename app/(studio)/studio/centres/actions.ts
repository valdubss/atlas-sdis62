"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/validation/comment";
import { centerSchema, groupingSchema, serviceSchema, slugify } from "@/lib/validation/center";
import { dispatchNotifications } from "@/lib/notifications/dispatch";

type Result = { ok: true } | { ok: false; error: string };
export type FormState = { status: "idle" } | { status: "saved" } | { status: "error"; message: string; fields?: Record<string, string> };

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !fields[key]) fields[key] = issue.message;
  }
  return fields;
}

async function requireEditor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, error: "Session expirée." };
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (me?.role !== "editor" && me?.role !== "admin") return { supabase, user: null, error: "Réservé au service communication." };
  return { supabase, user, error: null };
}

const revalidateAll = () => {
  for (const p of ["/studio/centres", "/studio/centres/referentiel", "/", "/agenda"]) revalidatePath(p);
};

// ---- File de validation ------------------------------------------------------

/** Valide ou refuse une proposition de publication (éditeur). */
export async function reviewPost(postId: string, decision: "published" | "declined", message?: string): Promise<Result> {
  if (!z.uuid().safeParse(postId).success) return { ok: false, error: "Identifiant invalide." };
  const msg = (message ?? "").trim().slice(0, 500);
  if (decision === "declined" && !msg) return { ok: false, error: "Indiquez un message pour l'auteur." };
  const { supabase, user, error } = await requireEditor();
  if (!user) return { ok: false, error: error! };
  const { error: dbError } = await supabase
    .from("posts")
    .update({ status: decision, moderation_message: msg || null })
    .eq("id", postId)
    .eq("scope", "center")
    .eq("status", "pending");
  if (dbError) return { ok: false, error: friendlyDbError(dbError.message) };
  if (decision === "published") after(async () => dispatchNotifications(20).catch((e) => console.error("dispatch centre", e)));
  else after(async () => dispatchNotifications(5).catch(() => {}));
  revalidateAll();
  return { ok: true };
}

/** Valide ou refuse un événement proposé par un référent. */
export async function reviewEvent(eventId: string, decision: "published" | "declined", message?: string): Promise<Result> {
  if (!z.uuid().safeParse(eventId).success) return { ok: false, error: "Identifiant invalide." };
  const msg = (message ?? "").trim().slice(0, 500);
  const { supabase, user, error } = await requireEditor();
  if (!user) return { ok: false, error: error! };
  const { error: dbError } = await supabase.from("events").update({ status: decision, moderation_message: msg || null }).eq("id", eventId).eq("status", "pending");
  if (dbError) return { ok: false, error: friendlyDbError(dbError.message) };
  revalidateAll();
  return { ok: true };
}

/** Promotion au fil départemental : seul chemin d'un contenu de centre vers le fil. */
export async function promotePost(postId: string): Promise<Result & { newId?: string }> {
  if (!z.uuid().safeParse(postId).success) return { ok: false, error: "Identifiant invalide." };
  const { supabase, user, error } = await requireEditor();
  if (!user) return { ok: false, error: error! };
  const { data, error: rpcError } = await supabase.rpc("promote_center_post", { p_post_id: postId });
  if (rpcError) {
    if (rpcError.message.includes("DEJA_PROMU")) return { ok: false, error: "Cette publication est déjà dans le fil." };
    return { ok: false, error: friendlyDbError(rpcError.message) };
  }
  after(async () => dispatchNotifications(20).catch(() => {}));
  revalidateAll();
  revalidatePath("/studio/posts");
  return { ok: true, newId: data as unknown as string };
}

// ---- Référentiel : groupements -------------------------------------------------

export async function saveGrouping(input: { id?: string | null; name: string; sort_order?: number }): Promise<Result> {
  const parsed = groupingSchema.safeParse({ id: input.id ?? "", name: input.name, sort_order: input.sort_order ?? 0 });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Valeur invalide." };
  const { supabase, user, error } = await requireEditor();
  if (!user) return { ok: false, error: error! };
  const v = parsed.data;
  const { error: dbError } = v.id
    ? await supabase.from("groupings").update({ name: v.name, sort_order: v.sort_order }).eq("id", v.id)
    : await supabase.from("groupings").insert({ name: v.name, sort_order: v.sort_order });
  if (dbError) return { ok: false, error: friendlyDbError(dbError.message) };
  revalidateAll();
  return { ok: true };
}

export async function deleteGrouping(id: string): Promise<Result> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Identifiant invalide." };
  const { supabase, user, error } = await requireEditor();
  if (!user) return { ok: false, error: error! };
  const { error: dbError } = await supabase.from("groupings").delete().eq("id", id);
  if (dbError) return { ok: false, error: friendlyDbError(dbError.message) };
  revalidateAll();
  return { ok: true };
}

// ---- Référentiel : centres ----------------------------------------------------

export async function saveCenter(_prev: FormState, formData: FormData): Promise<FormState> {
  const get = (k: string) => (formData.get(k) ?? "") as string;
  const parsed = centerSchema.safeParse({
    id: get("id"),
    name: get("name"),
    slug: get("slug"),
    type: get("type") || "cis",
    grouping_id: get("grouping_id"),
    address: get("address"),
    postal_code: get("postal_code"),
    city: get("city"),
    lat: get("lat"),
    lng: get("lng"),
    phone: get("phone"),
    email: get("email"),
    presentation: get("presentation"),
    chief_id: get("chief_id"),
    displayed_headcount: get("displayed_headcount"),
    cover_media_id: get("cover_media_id"),
    sort_order: get("sort_order") || 0,
    is_active: get("is_active") !== "false",
  });
  if (!parsed.success) return { status: "error", message: "Vérifiez les champs signalés.", fields: fieldErrors(parsed.error.issues) };
  const { supabase, user, error } = await requireEditor();
  if (!user) return { status: "error", message: error! };
  const v = parsed.data;
  const { id: _id, ...rest } = v;
  void _id;
  const row = { ...rest, slug: v.slug ?? slugify(v.name), pending_cover_media_id: null, pending_presentation: null, pending_by: null, pending_at: null };
  const { data, error: dbError } = v.id
    ? await supabase.from("centers").update(row).eq("id", v.id).select("id").single()
    : await supabase.from("centers").insert(row).select("id").single();
  if (dbError?.code === "23505") return { status: "error", message: "Vérifiez les champs signalés.", fields: { slug: "Cet identifiant d'adresse est déjà utilisé." } };
  if (dbError || !data) return { status: "error", message: friendlyDbError(dbError?.message) };
  revalidateAll();
  if (!v.id) redirect(`/studio/centres/referentiel/centre/${data.id}?ok=1`);
  return { status: "saved" };
}

/** Le service communication accepte (applique) ou écarte une modification de fiche proposée. */
export async function reviewCenterChange(changeId: string, accept: boolean, note?: string): Promise<Result> {
  if (!z.uuid().safeParse(changeId).success) return { ok: false, error: "Identifiant invalide." };
  const { supabase, user, error } = await requireEditor();
  if (!user) return { ok: false, error: error! };
  const { error: dbError } = await supabase.rpc("decide_center_change", { p_id: changeId, p_accept: accept, p_note: note?.trim() || null });
  if (dbError) return { ok: false, error: friendlyDbError(dbError.message) };
  revalidateAll();
  return { ok: true };
}

/** Compatibilité : accepte ou écarte d'un coup toutes les propositions en attente d'un centre. */
export async function reviewCenterUpdate(centerId: string, accept: boolean): Promise<Result> {
  if (!z.uuid().safeParse(centerId).success) return { ok: false, error: "Identifiant invalide." };
  const { supabase, user, error } = await requireEditor();
  if (!user) return { ok: false, error: error! };
  const { data: c } = await supabase.from("centers").select("pending_cover_media_id, pending_presentation").eq("id", centerId).maybeSingle();
  if (!c) return { ok: false, error: "Centre introuvable." };
  const patch = accept
    ? { cover_media_id: c.pending_cover_media_id ?? undefined, presentation: c.pending_presentation ?? undefined, pending_cover_media_id: null, pending_presentation: null, pending_by: null, pending_at: null }
    : { pending_cover_media_id: null, pending_presentation: null, pending_by: null, pending_at: null };
  const { error: dbError } = await supabase.from("centers").update(patch).eq("id", centerId);
  if (dbError) return { ok: false, error: friendlyDbError(dbError.message) };
  revalidateAll();
  return { ok: true };
}

// ---- Référents ----------------------------------------------------------------

/** Recherche d'un agent (nom, prénom, e-mail) pour le désigner référent. */
export async function searchAgents(q: string): Promise<{ id: string; first_name: string; last_name: string; email: string; avatar_key: string | null; role: string }[]> {
  const term = q.trim().replace(/[,()"%_\\]/g, "");
  if (term.length < 2) return [];
  const { supabase, user } = await requireEditor();
  if (!user) return [];
  const like = `%${term}%`;
  const { data } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, email, avatar_key, role")
    .eq("is_active", true)
    .or(`email.ilike."${like}",first_name.ilike."${like}",last_name.ilike."${like}"`)
    .order("last_name")
    .limit(8);
  return (data ?? []) as { id: string; first_name: string; last_name: string; email: string; avatar_key: string | null; role: string }[];
}

export async function addReferent(centerId: string, profileId: string): Promise<Result> {
  if (!z.uuid().safeParse(centerId).success || !z.uuid().safeParse(profileId).success) return { ok: false, error: "Identifiant invalide." };
  const { supabase, user, error } = await requireEditor();
  if (!user) return { ok: false, error: error! };
  const { error: dbError } = await supabase.from("center_referents").insert({ center_id: centerId, profile_id: profileId, created_by: user.id });
  if (dbError) return { ok: false, error: dbError.message.includes("center_referents_active_uniq") ? "Cet agent est déjà référent de ce centre." : friendlyDbError(dbError.message) };
  revalidateAll();
  return { ok: true };
}

export async function removeReferent(referentId: string): Promise<Result> {
  if (!z.uuid().safeParse(referentId).success) return { ok: false, error: "Identifiant invalide." };
  const { supabase, user, error } = await requireEditor();
  if (!user) return { ok: false, error: error! };
  const { error: dbError } = await supabase.from("center_referents").update({ is_active: false, ended_at: new Date().toISOString().slice(0, 10) }).eq("id", referentId);
  if (dbError) return { ok: false, error: friendlyDbError(dbError.message) };
  revalidateAll();
  return { ok: true };
}

// ---- Référentiel : services ----------------------------------------------------

export async function saveService(_prev: FormState, formData: FormData): Promise<FormState> {
  const get = (k: string) => (formData.get(k) ?? "") as string;
  const parsed = serviceSchema.safeParse({
    id: get("id"),
    name: get("name"),
    slug: get("slug"),
    short_description: get("short_description"),
    mission: get("mission"),
    contact_reasons: get("contact_reasons"),
    manager_id: get("manager_id"),
    phone: get("phone"),
    email: get("email"),
    address: get("address"),
    grouping_id: get("grouping_id"),
    sort_order: get("sort_order") || 0,
    is_active: get("is_active") !== "false",
  });
  if (!parsed.success) return { status: "error", message: "Vérifiez les champs signalés.", fields: fieldErrors(parsed.error.issues) };
  const { supabase, user, error } = await requireEditor();
  if (!user) return { status: "error", message: error! };
  const v = parsed.data;
  const { id: _sid, ...srest } = v;
  void _sid;
  const row = { ...srest, slug: v.slug ?? slugify(v.name) };
  const { data, error: dbError } = v.id
    ? await supabase.from("services").update(row).eq("id", v.id).select("id").single()
    : await supabase.from("services").insert(row).select("id").single();
  if (dbError?.code === "23505") return { status: "error", message: "Vérifiez les champs signalés.", fields: { slug: "Cet identifiant d'adresse est déjà utilisé." } };
  if (dbError || !data) return { status: "error", message: friendlyDbError(dbError?.message) };
  revalidateAll();
  if (!v.id) redirect(`/studio/centres/referentiel/service/${data.id}?ok=1`);
  return { status: "saved" };
}
