"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { friendlyDbError } from "@/lib/validation/comment";
import type { UserRole } from "@/lib/supabase/database.types";

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
