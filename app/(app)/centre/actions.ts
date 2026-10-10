"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { friendlyDbError } from "@/lib/validation/comment";
import { attachSchema, centerSettingsSchema } from "@/lib/validation/profile";
import { centerUpdateSchema, proposalEventSchema, proposalPostSchema } from "@/lib/validation/proposal";
import { parseInput } from "@/lib/validation/event";
import { requestMembership } from "@/lib/membership/request";
import { sendMembershipDecisionEmail } from "@/lib/membership/email";

type Result = { ok: true } | { ok: false; error: string };

async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function revalidateCenter() {
  revalidatePath("/centre");
  revalidatePath("/profil");
  revalidatePath("/profil/centre");
}

function humanError(message: string | undefined): string {
  const m = message ?? "";
  if (m.includes("LIMITE_SUIVIS")) return "Vous suivez déjà 3 centres. Retirez-en un pour en ajouter un autre.";
  if (m.includes("LIMITE_PROPOSITIONS")) return "Vous avez déjà 10 propositions en attente. Patientez le temps de leur validation.";
  if (m.includes("ACCES_REFUSE")) return "Action réservée aux référents de ce centre.";
  return friendlyDbError(m);
}

/**
 * Rattachement à un centre ou à un service : une demande part au chef de centre
 * (ou au responsable com, ou au service communication) ; le profil n'est
 * rattaché qu'à l'acceptation.
 */
export async function attachTo(input: unknown): Promise<{ ok: true; href: string; pending: true; targetName: string; recipient: string | null } | { ok: false; error: string }> {
  const parsed = attachSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Sélection invalide." };
  const { center_id, service_id } = parsed.data;
  const { user } = await me();
  if (!user) return { ok: false, error: "Session expirée." };
  const r = await requestMembership({ center_id: service_id ? null : center_id, service_id: center_id ? null : service_id });
  if (!r.ok) return r;
  revalidateCenter();
  revalidatePath("/");
  return { ok: true, href: "/profil/centre", pending: true, targetName: r.targetName, recipient: r.recipient };
}

/** L'agent retire sa demande en attente. */
export async function cancelMyRequest(requestId: string): Promise<Result> {
  if (!z.uuid().safeParse(requestId).success) return { ok: false, error: "Identifiant invalide." };
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Session expirée." };
  const { error } = await supabase.rpc("cancel_membership_request", { p_request: requestId });
  if (error) return { ok: false, error: humanError(error.message) };
  revalidateCenter();
  return { ok: true };
}

/** Chef de centre, responsable com ou service communication : décision dans l'app. */
export async function decideRequest(requestId: string, accept: boolean, note?: string): Promise<Result> {
  if (!z.uuid().safeParse(requestId).success) return { ok: false, error: "Identifiant invalide." };
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Session expirée." };
  const { data, error } = await supabase.rpc("decide_membership", { p_request: requestId, p_accept: accept, p_note: note?.trim() || null });
  if (error) return { ok: false, error: error.message.includes("ACCES_REFUSE") ? "Réservé au chef de centre, au responsable communication et au service communication." : humanError(error.message) };
  const r = data as { ok: boolean; reason?: string; requester_email?: string; requester_name?: string; target_name?: string };
  if (!r.ok) return { ok: false, error: r.reason === "expired" ? "Cette demande a expiré." : "Cette demande n'est plus en attente." };
  if (r.requester_email) sendMembershipDecisionEmail(r.requester_email, r.requester_name ?? "", r.target_name ?? "", accept, note?.trim() || null).catch(() => {});
  revalidateCenter();
  revalidatePath("/studio/centres/demandes");
  return { ok: true };
}

const contactsSchema = z.object({
  chief_name: z.string().trim().max(120).transform((s) => s || null),
  chief_email: z.string().trim().toLowerCase().max(160).transform((s) => s || null).refine((s) => s === null || z.email().safeParse(s).success, "Adresse invalide."),
  com_name: z.string().trim().max(120).transform((s) => s || null),
  com_email: z.string().trim().toLowerCase().max(160).transform((s) => s || null).refine((s) => s === null || z.email().safeParse(s).success, "Adresse invalide."),
});

/** Administrateur : qui valide les arrivées dans ce centre (page du centre, annuaire). */
export async function saveCenterContacts(centerId: string, input: unknown): Promise<Result> {
  if (!z.uuid().safeParse(centerId).success) return { ok: false, error: "Centre invalide." };
  const parsed = contactsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Vérifiez les adresses." };
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Session expirée." };
  const { data: meRow } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (meRow?.role !== "admin") return { ok: false, error: "Réservé aux administrateurs." };
  const { error } = await supabase.from("centers").update(parsed.data).eq("id", centerId);
  if (error) return { ok: false, error: humanError(error.message) };
  revalidatePath("/centre");
  revalidatePath("/annuaire");
  return { ok: true };
}

export async function followCenter(centerId: string, follow: boolean): Promise<Result> {
  if (!z.uuid().safeParse(centerId).success) return { ok: false, error: "Identifiant invalide." };
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Session expirée." };
  const { error } = follow
    ? await supabase.from("center_follows").upsert({ profile_id: user.id, center_id: centerId }, { onConflict: "profile_id,center_id", ignoreDuplicates: true })
    : await supabase.from("center_follows").delete().eq("profile_id", user.id).eq("center_id", centerId);
  if (error) return { ok: false, error: humanError(error.message) };
  revalidateCenter();
  return { ok: true };
}

/** Profil → Mon centre : fonction, téléphone pro, présentation, annuaire. */
export async function updateCenterSettings(input: unknown): Promise<Result> {
  const parsed = centerSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Valeur invalide." };
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Session expirée." };
  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", user.id);
  if (error) return { ok: false, error: humanError(error.message) };
  revalidateCenter();
  return { ok: true };
}

/** Un référent propose une actu (texte, photos ou vidéo) pour son centre. */
export async function proposePost(centerId: string, input: unknown): Promise<{ ok: true; id: string } | { ok: false; error: string; fields?: Record<string, string> }> {
  if (!z.uuid().safeParse(centerId).success) return { ok: false, error: "Centre invalide." };
  const parsed = proposalPostSchema.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const k = String(i.path[0] ?? "");
      if (k && !fields[k]) fields[k] = i.message;
    }
    return { ok: false, error: Object.values(fields)[0] ?? "Vérifiez les champs.", fields };
  }
  const v = parsed.data;
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Session expirée." };
  if (v.media.length > 0) {
    const { data: rows } = await supabase.from("media").select("id, status, kind").in("id", v.media);
    const ready = (rows ?? []).filter((r) => r.status === "ready");
    if (ready.length !== v.media.length) return { ok: false, error: "Attendez la fin du traitement des médias." };
    if (v.kind === "video" && ready[0]?.kind !== "video") return { ok: false, error: "Ajoutez une vidéo." };
    if (v.kind === "photo" && ready.some((r) => r.kind !== "image")) return { ok: false, error: "Seules des photos sont acceptées ici." };
  }
  const { data: post, error } = await supabase
    .from("posts")
    .insert({ type: v.kind, title: v.title, body: v.body, scope: "center", center_id: centerId, status: "pending", comments_enabled: true, author_id: user.id, author_display: "agent" })
    .select("id")
    .single();
  if (error || !post) return { ok: false, error: humanError(error?.message) };
  if (v.media.length > 0) {
    const { error: pmError } = await supabase.from("post_media").insert(v.media.map((media_id, position) => ({ post_id: post.id, media_id, position })));
    if (pmError) {
      await supabase.from("posts").delete().eq("id", post.id);
      return { ok: false, error: humanError(pmError.message) };
    }
  }
  revalidatePath("/profil/propositions");
  revalidatePath("/studio/centres");
  return { ok: true, id: post.id };
}

/**
 * Événement de centre. Chef de centre, responsable communication ou référent :
 * publié directement, visible des seuls membres du centre (et du service
 * communication). Les événements de tout le SDIS restent créés dans le Studio.
 */
export async function proposeEvent(centerId: string, input: unknown): Promise<{ ok: true; id: string; published: boolean } | { ok: false; error: string; fields?: Record<string, string> }> {
  if (!z.uuid().safeParse(centerId).success) return { ok: false, error: "Centre invalide." };
  const parsed = proposalEventSchema.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const k = String(i.path[0] ?? "");
      if (k && !fields[k]) fields[k] = i.message;
    }
    return { ok: false, error: Object.values(fields)[0] ?? "Vérifiez les champs.", fields };
  }
  const v = parsed.data;
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Session expirée." };
  const { data: manager } = await supabase.rpc("can_manage_center", { p_center: centerId });
  const { data, error } = await supabase
    .from("events")
    .insert({
      title: v.title,
      description: v.description,
      location: v.location,
      all_day: v.all_day,
      starts_at: parseInput(v.starts_at, v.all_day, false)!.toISOString(),
      ends_at: v.ends_at ? parseInput(v.ends_at, v.all_day, true)!.toISOString() : null,
      center_id: centerId,
      status: manager ? "published" : "pending",
      author_id: user.id,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message.includes("ACCES_REFUSE") ? "Réservé au chef de centre et au responsable communication." : humanError(error?.message) };
  revalidatePath("/profil/propositions");
  revalidatePath("/studio/centres");
  revalidatePath("/centre");
  revalidatePath("/agenda");
  return { ok: true, id: data.id, published: Boolean(manager) };
}

/** Un référent propose une nouvelle présentation et/ou photo de couverture. */
export async function proposeCenterUpdate(centerId: string, input: unknown): Promise<Result> {
  if (!z.uuid().safeParse(centerId).success) return { ok: false, error: "Centre invalide." };
  const parsed = centerUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Vérifiez les champs." };
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Session expirée." };
  const changes = Object.entries(parsed.data)
    .filter(([, value]) => value !== null)
    .map(([field, value]) => ({ field, value: String(value) }));
  const { error } = await supabase.rpc("propose_center_changes", { p_center: centerId, p_changes: changes });
  if (error) return { ok: false, error: error.message.includes("PROPOSITION_VIDE") ? "Aucune modification par rapport à la fiche actuelle." : humanError(error.message) };
  revalidatePath("/studio/centres/referentiel");
  return { ok: true };
}

/** Retire une proposition encore en attente (post ou événement). */
export async function withdrawProposal(kind: "post" | "event", id: string): Promise<Result> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Identifiant invalide." };
  const { supabase, user } = await me();
  if (!user) return { ok: false, error: "Session expirée." };
  const { error } =
    kind === "post"
      ? await supabase.from("posts").delete().eq("id", id).eq("submitted_by", user.id).eq("status", "pending")
      : await supabase.from("events").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("submitted_by", user.id).eq("status", "pending");
  if (error) return { ok: false, error: humanError(error.message) };
  revalidatePath("/profil/propositions");
  revalidatePath("/studio/centres");
  return { ok: true };
}
