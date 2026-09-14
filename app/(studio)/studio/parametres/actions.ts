"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { dispatchNotifications } from "@/lib/notifications/dispatch";
import { sendWeeklyDigest } from "@/lib/email/digest";

type Result = { ok: true; message?: string } | { ok: false; error: string };

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return me?.role === "admin" ? { supabase, user } : null;
}

export async function setDigestEnabled(enabled: boolean): Promise<Result> {
  const ctx = await requireAdmin();
  if (!ctx) return { ok: false, error: "Réservé aux administrateurs." };
  const { error } = await ctx.supabase.from("app_settings").upsert({ key: "digest_enabled", value: enabled, updated_by: ctx.user.id });
  if (error) return { ok: false, error: "Enregistrement impossible." };
  revalidatePath("/studio/parametres");
  return { ok: true };
}

/** Réglages d'authentification et adresse des signalements (admin). */
export async function setAppSetting(key: "auth_password_enabled" | "auth_magic_link_enabled" | "auth_sso_forced" | "feedback_email", value: boolean | string): Promise<Result> {
  const ctx = await requireAdmin();
  if (!ctx) return { ok: false, error: "Réservé aux administrateurs." };
  if (key === "feedback_email" && typeof value === "string" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return { ok: false, error: "Adresse e-mail invalide." };
  if ((key === "auth_password_enabled" || key === "auth_magic_link_enabled") && value === false) {
    // Jamais zéro moyen de connexion : l'autre méthode ou le SSO doit rester actif
    const other = key === "auth_password_enabled" ? "auth_magic_link_enabled" : "auth_password_enabled";
    const { data } = await ctx.supabase.from("app_settings").select("value").eq("key", other).maybeSingle();
    const otherEnabled = data?.value !== false;
    if (!otherEnabled && process.env.AUTH_OIDC_PROVIDER !== "azure") return { ok: false, error: "Impossible : plus aucun moyen de connexion ne resterait actif." };
  }
  const { error } = await ctx.supabase.from("app_settings").upsert({ key, value, updated_by: ctx.user.id });
  if (error) return { ok: false, error: "Enregistrement impossible." };
  revalidatePath("/studio/parametres");
  revalidatePath("/login");
  return { ok: true };
}

/** Envoie le digest de la semaine à une seule adresse, pour vérifier le rendu. */
export async function sendDigestTest(to: string): Promise<Result> {
  const ctx = await requireAdmin();
  if (!ctx) return { ok: false, error: "Réservé aux administrateurs." };
  const r = await sendWeeklyDigest({ testRecipient: to });
  if (r.posts === 0) return { ok: false, error: "Aucune publication cette semaine, rien à envoyer." };
  if (r.sent === 0) return { ok: false, error: "Envoi impossible : vérifiez RESEND_API_KEY ou SMTP_HOST." };
  return { ok: true, message: `Digest envoyé à ${to} (${r.posts} publications).` };
}

/** Force le traitement immédiat de la file de push. */
export async function flushQueue(): Promise<Result> {
  const ctx = await requireAdmin();
  if (!ctx) return { ok: false, error: "Réservé aux administrateurs." };
  const r = await dispatchNotifications(50);
  revalidatePath("/studio/parametres");
  return { ok: true, message: `${r.processed} notification(s) traitée(s), ${r.sent} envoi(s), ${r.removed} abonnement(s) expiré(s) retiré(s).` };
}
