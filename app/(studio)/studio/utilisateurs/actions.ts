"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { friendlyDbError } from "@/lib/validation/comment";
import type { Database, UserRole } from "@/lib/supabase/database.types";
import { LIMITS } from "@/lib/config";
import { isAllowedEmail } from "@/lib/auth/domains";
import { sendAccountEmail } from "@/lib/auth/invite";

type Result = { ok: true } | { ok: false; error: string };

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, error: "Session expirée." };
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (me?.role !== "admin") return { supabase, user: null, error: "Réservé aux administrateurs." };
  return { supabase, user, error: null };
}

export async function setUserRole(userId: string, role: UserRole): Promise<Result> {
  if (!z.uuid().safeParse(userId).success || !["admin", "editor", "reader"].includes(role)) return { ok: false, error: "Valeur invalide." };
  const { supabase, user, error } = await requireAdmin();
  if (!user) return { ok: false, error: error! };
  if (user.id === userId && role !== "admin") return { ok: false, error: "Vous ne pouvez pas retirer votre propre rôle d'administrateur." };
  const { error: dbError } = await supabase.from("profiles").update({ role }).eq("id", userId);
  if (dbError) return { ok: false, error: friendlyDbError(dbError.message) };
  revalidatePath("/studio/utilisateurs");
  return { ok: true };
}

export async function setUserActive(userId: string, active: boolean): Promise<Result> {
  if (!z.uuid().safeParse(userId).success) return { ok: false, error: "Identifiant invalide." };
  const { supabase, user, error } = await requireAdmin();
  if (!user) return { ok: false, error: error! };
  if (user.id === userId && !active) return { ok: false, error: "Vous ne pouvez pas désactiver votre propre compte." };
  const { error: dbError } = await supabase.from("profiles").update({ is_active: active }).eq("id", userId);
  if (dbError) return { ok: false, error: friendlyDbError(dbError.message) };
  // Un compte désactivé ne doit plus pouvoir rafraîchir sa session ni se reconnecter
  try {
    await createAdminClient().auth.admin.updateUserById(userId, { ban_duration: active ? "none" : "876000h" });
  } catch (e) {
    console.error("ban utilisateur", e);
  }
  revalidatePath("/studio/utilisateurs");
  return { ok: true };
}

/** Export RGPD : toutes les données de l'agent, en JSON. */
export async function exportUserData(userId: string): Promise<{ ok: true; json: string } | { ok: false; error: string }> {
  if (!z.uuid().safeParse(userId).success) return { ok: false, error: "Identifiant invalide." };
  const { supabase, user, error } = await requireAdmin();
  if (!user) return { ok: false, error: error! };
  const { data, error: rpcError } = await supabase.rpc("export_user_data", { p_user_id: userId });
  if (rpcError) return { ok: false, error: friendlyDbError(rpcError.message) };
  return { ok: true, json: JSON.stringify(data, null, 2) };
}

/**
 * Suppression RGPD : anonymise les données en base (fonction SQL), puis supprime
 * le compte d'authentification avec la clé service_role.
 */
export async function deleteUser(userId: string): Promise<Result> {
  if (!z.uuid().safeParse(userId).success) return { ok: false, error: "Identifiant invalide." };
  const { supabase, user, error } = await requireAdmin();
  if (!user) return { ok: false, error: error! };
  if (user.id === userId) return { ok: false, error: "Vous ne pouvez pas supprimer votre propre compte." };

  const { error: rpcError } = await supabase.rpc("anonymize_user_data", { p_user_id: userId });
  if (rpcError) return { ok: false, error: friendlyDbError(rpcError.message) };

  try {
    const admin = createAdminClient();
    const { error: authError } = await admin.auth.admin.deleteUser(userId);
    if (authError) return { ok: false, error: "Données anonymisées, mais le compte de connexion n'a pas pu être supprimé : " + authError.message };
  } catch (e) {
    return { ok: false, error: "Données anonymisées, mais SUPABASE_SERVICE_ROLE_KEY est absente : compte de connexion conservé. " + String(e) };
  }

  revalidatePath("/studio/utilisateurs");
  return { ok: true };
}

/** Identité et rattachement, modifiés par un administrateur (sans validation par le chef de centre). */
const profileSchema = z.object({
  first_name: z.string().trim().max(60).default(""),
  last_name: z.string().trim().max(60).default(""),
  center_id: z.string().trim().transform((s) => s || null).refine((s) => s === null || z.uuid().safeParse(s).success, "Centre invalide."),
  service_id: z.string().trim().transform((s) => s || null).refine((s) => s === null || z.uuid().safeParse(s).success, "Service invalide."),
});

export async function updateUserProfile(userId: string, input: unknown): Promise<Result> {
  if (!z.uuid().safeParse(userId).success) return { ok: false, error: "Identifiant invalide." };
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Valeur invalide." };
  const { supabase, user, error } = await requireAdmin();
  if (!user) return { ok: false, error: error! };
  const v = parsed.data;
  const row = { first_name: v.first_name, last_name: v.last_name, center_id: v.service_id ? null : v.center_id, service_id: v.center_id ? null : v.service_id, center_joined_at: v.center_id ? new Date().toISOString().slice(0, 10) : null };
  const { data: before } = await supabase.from("profiles").select("center_id, center_joined_at").eq("id", userId).maybeSingle();
  if (before && before.center_id === row.center_id) row.center_joined_at = before.center_joined_at;
  const { error: dbError } = await supabase.from("profiles").update(row).eq("id", userId);
  if (dbError) return { ok: false, error: friendlyDbError(dbError.message) };
  // Un rattachement posé par l'administrateur clôt la demande en attente de l'agent
  await createAdminClient().from("membership_requests").update({ status: "accepted", decided_at: new Date().toISOString(), decided_by: user.id, decided_via: "admin" }).eq("profile_id", userId).eq("status", "pending");
  revalidatePath("/studio/utilisateurs");
  return { ok: true };
}

/** Renvoie un e-mail de connexion (lien + code) à un agent qui n'arrive pas à se connecter. */
export async function sendLoginEmail(userId: string): Promise<Result> {
  if (!z.uuid().safeParse(userId).success) return { ok: false, error: "Identifiant invalide." };
  const { supabase, user, error } = await requireAdmin();
  if (!user) return { ok: false, error: error! };
  const { data: target } = await supabase.from("profiles").select("email, first_name, onboarded_at").eq("id", userId).maybeSingle();
  if (!target) return { ok: false, error: "Compte introuvable." };
  return sendAccountEmail(target.onboarded_at ? "magiclink" : "invite", target.email, { firstName: target.first_name, by: `${user.email ?? "un administrateur"}` });
}

/** Un administrateur pose lui-même un mot de passe (dépannage) ; l'agent peut le changer ensuite dans son profil. */
export async function setUserPassword(userId: string, password: string): Promise<Result> {
  if (!z.uuid().safeParse(userId).success) return { ok: false, error: "Identifiant invalide." };
  const parsed = z.string().min(LIMITS.passwordMinLength, `${LIMITS.passwordMinLength} caractères minimum.`).max(200).safeParse(password);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Mot de passe invalide." };
  const { supabase, user, error } = await requireAdmin();
  if (!user) return { ok: false, error: error! };
  const admin = createAdminClient();
  const { error: authError } = await admin.auth.admin.updateUserById(userId, { password: parsed.data });
  if (authError) {
    const m = authError.message;
    if (/weak|pwned|leaked|compromised/i.test(m)) return { ok: false, error: "Mot de passe trop faible ou connu dans des fuites de données." };
    if (/should contain|at least|characters|requirements/i.test(m)) return { ok: false, error: "Mot de passe refusé : " + m };
    return { ok: false, error: "Modification impossible : " + m };
  }
  // Journal : aucune écriture directe par les utilisateurs (RLS), on passe par la clé service_role
  await admin.from("audit_log").insert({ actor_id: user.id, action: "password_set", entity_type: "profiles", entity_id: userId }).then(() => undefined, () => undefined);
  return { ok: true };
}

/** Envoie un e-mail de réinitialisation du mot de passe (l'agent le choisit lui-même). */
export async function sendPasswordReset(userId: string): Promise<Result> {
  if (!z.uuid().safeParse(userId).success) return { ok: false, error: "Identifiant invalide." };
  const { supabase, user, error } = await requireAdmin();
  if (!user) return { ok: false, error: error! };
  const { data: target } = await supabase.from("profiles").select("email, first_name").eq("id", userId).maybeSingle();
  if (!target) return { ok: false, error: "Compte introuvable." };
  return sendAccountEmail("recovery", target.email, { firstName: target.first_name });
}

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide.").max(160),
  password: z.string().max(200).refine((p) => p === "" || p.length >= LIMITS.passwordMinLength, `${LIMITS.passwordMinLength} caractères minimum.`),
  center_id: z.string().trim().transform((s) => s || null).refine((s) => s === null || z.uuid().safeParse(s).success, "Centre invalide."),
  first_name: z.string().trim().max(60).optional().default(""),
  last_name: z.string().trim().max(60).optional().default(""),
  role: z.enum(["reader", "editor", "admin"]).default("reader"),
});

export type CreateUserState = { status: "idle" } | { status: "created"; email: string; invited: boolean; warning?: string } | { status: "error"; message: string; fields?: Record<string, string> };

/**
 * Création d'un compte par un administrateur : par défaut une invitation par
 * e-mail (lien + code), sans mot de passe. Un mot de passe initial reste possible
 * pour les cas particuliers. Prénom, nom, rôle et centre sont posés directement.
 */
export async function createUser(_prev: CreateUserState, formData: FormData): Promise<CreateUserState> {
  const parsed = createSchema.safeParse({
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
    center_id: formData.get("center_id") ?? "",
    first_name: formData.get("first_name") ?? "",
    last_name: formData.get("last_name") ?? "",
    role: formData.get("role") ?? "reader",
  });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (key && !fields[key]) fields[key] = issue.message;
    }
    return { status: "error", message: "Vérifiez les champs signalés.", fields };
  }
  const v = parsed.data;
  const { user, error } = await requireAdmin();
  if (!user) return { status: "error", message: error! };
  if (!isAllowedEmail(v.email)) return { status: "error", message: "Ce domaine n'est pas autorisé sur ATLAS (voir ALLOWED_EMAIL_DOMAINS / adresses autorisées).", fields: { email: "Domaine non autorisé." } };

  const admin = createAdminClient();
  const { data, error: createError } = await admin.auth.admin.createUser({
    email: v.email,
    ...(v.password ? { password: v.password } : {}),
    email_confirm: true,
    user_metadata: { first_name: v.first_name, last_name: v.last_name },
  });
  if (createError || !data.user) {
    const msg = createError?.message ?? "";
    if (/already|exists|registered/i.test(msg)) return { status: "error", message: "Un compte existe déjà avec cette adresse.", fields: { email: "Adresse déjà utilisée." } };
    if (/DOMAINE_NON_AUTORISE/.test(msg)) return { status: "error", message: "Domaine non autorisé.", fields: { email: "Domaine non autorisé." } };
    console.error("createUser", msg);
    return { status: "error", message: "Création impossible : " + msg };
  }
  const patch: Database["public"]["Tables"]["profiles"]["Update"] = {};
  if (v.role !== "reader") patch.role = v.role;
  if (v.center_id) {
    patch.center_id = v.center_id;
    patch.center_joined_at = new Date().toISOString().slice(0, 10);
  }
  if (Object.keys(patch).length > 0) {
    const { error: patchError } = await admin.from("profiles").update(patch).eq("id", data.user.id);
    if (patchError) console.error("createUser profil", patchError.message);
  }
  revalidatePath("/studio/utilisateurs");
  let warning: string | undefined;
  if (!v.password) {
    const sent = await sendAccountEmail("invite", v.email, { firstName: v.first_name, by: `${user.email ?? "un administrateur"}` });
    if (!sent.ok) warning = "Compte créé, mais l'invitation n'a pas pu partir : " + sent.error;
  }
  return { status: "created", email: v.email, invited: !v.password, warning };
}
