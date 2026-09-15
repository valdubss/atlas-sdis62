"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { friendlyDbError } from "@/lib/validation/comment";
import type { UserRole } from "@/lib/supabase/database.types";
import { LIMITS } from "@/lib/config";
import { isAllowedEmail } from "@/lib/auth/domains";

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

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide.").max(160),
  password: z.string().min(LIMITS.passwordMinLength, `${LIMITS.passwordMinLength} caractères minimum.`).max(200),
  first_name: z.string().trim().max(60).optional().default(""),
  last_name: z.string().trim().max(60).optional().default(""),
  role: z.enum(["reader", "editor", "admin"]).default("reader"),
});

export type CreateUserState = { status: "idle" } | { status: "created"; email: string } | { status: "error"; message: string; fields?: Record<string, string> };

/**
 * Création d'un compte par un administrateur : adresse + mot de passe initial
 * (modifiable ensuite par l'agent dans son profil), prénom, nom et rôle.
 * Le compte est confirmé d'office ; l'agent voit l'accueil au premier accès.
 */
export async function createUser(_prev: CreateUserState, formData: FormData): Promise<CreateUserState> {
  const parsed = createSchema.safeParse({
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
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
    password: v.password,
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
  if (v.role !== "reader") {
    const { error: roleError } = await admin.from("profiles").update({ role: v.role }).eq("id", data.user.id);
    if (roleError) console.error("createUser role", roleError.message);
  }
  revalidatePath("/studio/utilisateurs");
  return { status: "created", email: v.email };
}
