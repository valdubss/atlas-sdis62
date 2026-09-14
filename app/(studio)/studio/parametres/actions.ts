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
