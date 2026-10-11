"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAllowedEmail, getAllowedDomains } from "@/lib/auth/domains";
import { loginSchema, passwordLoginSchema } from "@/lib/validation/auth";
import { getAuthSettings } from "@/lib/auth/settings";
import { azureOAuthOptions } from "@/lib/auth/providers";
import { appMailConfigured, sendLoginEmailFor } from "@/lib/auth/invite";

export type LoginState =
  | { status: "idle" }
  | { status: "sent"; email: string; next: string }
  | { status: "error"; message: string };

function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || /^\/[\/\\]/.test(next)) return "/";
  return next;
}

function notAllowedMessage() {
  const domains = getAllowedDomains();
  return domains.length > 0
    ? `Seules les adresses ${domains.map((d) => "@" + d).join(", ")} (ou autorisées individuellement) sont acceptées.`
    : "Aucun domaine e-mail autorisé n'est configuré (ALLOWED_EMAIL_DOMAINS).";
}

/** Première connexion ou mot de passe oublié : e-mail d'ATLAS avec le lien (et le code) pour définir le mot de passe. */
export async function sendMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const auth = await getAuthSettings();
  if (!auth.magicLinkEnabled) return { status: "error", message: "La connexion par lien e-mail est désactivée." };
  const parsed = loginSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Adresse invalide." };
  }
  const { email } = parsed.data;

  if (!isAllowedEmail(email)) {
    return { status: "error", message: notAllowedMessage() };
  }

  const next = safeNext(formData.get("next") as string | null);

  // Les e-mails partent par le transport d'ATLAS (Resend ou SMTP) : expéditeur, objet et
  // contenu sont ceux d'ATLAS. Jamais d'e-mail standard Supabase.
  if (!appMailConfigured()) return { status: "error", message: "L'envoi d'e-mails n'est pas encore configuré. Contactez le service communication." };
  const r = await sendLoginEmailFor(email);
  if (!r.ok) return { status: "error", message: r.error };
  return { status: "sent", email, next };
}

/**
 * Connexion par le code à six chiffres reçu dans le même e-mail que le lien.
 * Utile quand la messagerie « ouvre » les liens avant l'agent (passerelles de
 * sécurité) ou quand l'e-mail est lu sur un autre appareil.
 */
export async function verifyEmailCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email") });
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  const next = safeNext(formData.get("next") as string | null);
  if (!parsed.success) return { status: "error", message: "Adresse invalide." };
  if (code.length < 6) return { status: "sent", email: parsed.data.email, next };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email: parsed.data.email, token: code, type: "email" });
  if (error) {
    if (error.status === 429) return { status: "error", message: "Trop de tentatives. Patientez quelques minutes." };
    return { status: "error", message: "Code incorrect ou expiré. Demandez un nouvel e-mail." };
  }
  // Sans mot de passe (première connexion, mot de passe oublié) : il se choisit tout de suite
  const passwordSet = (data.user?.app_metadata as { password_set?: boolean } | undefined)?.password_set === true;
  redirect(passwordSet ? next : "/bienvenue?mdp=1");
}

/** Connexion par mot de passe (le mode normal : chaque agent en définit un à sa première connexion). */
export async function signInWithPassword(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const auth = await getAuthSettings();
  if (!auth.passwordEnabled) return { status: "error", message: "La connexion par mot de passe est désactivée." };
  const parsed = passwordLoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Champs invalides." };
  }
  const { email, password } = parsed.data;

  if (!isAllowedEmail(email)) {
    return { status: "error", message: notAllowedMessage() };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.status === 429) {
      return { status: "error", message: "Trop de tentatives. Patientez quelques minutes." };
    }
    return {
      status: "error",
      message:
        "Identifiants incorrects. Première connexion ou mot de passe oublié ? Demandez un lien ci-dessous.",
    };
  }

  redirect(safeNext(formData.get("next") as string | null));
}

/** SSO Microsoft Entra ID : redirige vers Microsoft via Supabase Auth. */
export async function startSso(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const auth = await getAuthSettings();
  if (!auth.ssoEnabled) return { status: "error", message: "La connexion Microsoft n'est pas configurée." };
  const h = await headers();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const next = safeNext(formData.get("next") as string | null);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth(azureOAuthOptions(`${origin}/auth/callback?next=${encodeURIComponent(next)}`));
  if (error || !data.url) return { status: "error", message: "La connexion Microsoft a échoué. Réessayez." };
  redirect(data.url);
}
