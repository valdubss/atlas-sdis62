"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAllowedEmail, getAllowedDomains } from "@/lib/auth/domains";
import { firstAccessSchema, identifierLoginSchema, loginSchema, passwordLoginSchema } from "@/lib/validation/auth";
import { requestFirstAccess, resolveLoginIdentifier, tempPasswordExpired } from "@/lib/auth/first-access";
import { getAuthSettings } from "@/lib/auth/settings";
import { azureOAuthOptions } from "@/lib/auth/providers";
import { appMailConfigured, sendLoginEmailFor } from "@/lib/auth/invite";

export type LoginState =
  | { status: "idle" }
  | { status: "sent"; email: string; next: string }
  | { status: "error"; message: string };

export type FirstAccessState = { status: "idle" } | { status: "sent"; email: string; personalEmail: string } | { status: "error"; message: string; fields?: Record<string, string> };

/**
 * Première connexion par matricule (réglage « registry ») : adresse SDIS + matricule +
 * adresse personnelle. Le matricule est vérifié dans le référentiel avant tout envoi.
 */
export async function requestFirstAccessAction(_prev: FirstAccessState, formData: FormData): Promise<FirstAccessState> {
  const auth = await getAuthSettings();
  if (auth.firstAccess !== "registry") return { status: "error", message: "Ce mode de première connexion est désactivé." };
  const parsed = firstAccessSchema.safeParse({ email: formData.get("email"), matricule: formData.get("matricule"), personalEmail: formData.get("personalEmail") });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const k = String(i.path[0] ?? "");
      if (k && !fields[k]) fields[k] = i.message;
    }
    return { status: "error", message: "Vérifiez les champs.", fields };
  }
  const h = await headers();
  const client = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "";
  const r = await requestFirstAccess(parsed.data, client);
  if (!r.ok) return { status: "error", message: r.error, fields: r.field ? { [r.field]: r.error } : undefined };
  return { status: "sent", email: parsed.data.email, personalEmail: r.personalEmail };
}

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

  // Transport d'ATLAS (Resend ou SMTP) : expéditeur, objet et contenu d'ATLAS, lien + code.
  if (appMailConfigured()) {
    const r = await sendLoginEmailFor(email);
    if (!r.ok) return { status: "error", message: r.error };
    return { status: "sent", email, next };
  }

  // Sans transport : e-mail standard Supabase (lien seul). Le compte est créé à la demande
  // (domaine vérifié par le trigger) et l'agent arrive sur l'écran qui lui fait choisir son
  // mot de passe. Flux PKCE : ce navigateur détient le code vérificateur, le retour porte ?code=.
  const h = await headers();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/bienvenue?mdp=1")}`, shouldCreateUser: true },
  });
  if (error) {
    if (error.message.includes("DOMAINE_NON_AUTORISE") || error.message.includes("Database error")) return { status: "error", message: "Cette adresse n'est pas autorisée." };
    if (error.status === 429) return { status: "error", message: "Trop de demandes. Patientez quelques minutes avant de réessayer." };
    return { status: "error", message: "Envoi impossible pour le moment. Réessayez." };
  }
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
  // Mode « registry » : l'identifiant est l'adresse SDIS ou le matricule
  let email: string;
  let password: string;
  if (formData.has("identifier")) {
    const parsed = identifierLoginSchema.safeParse({ identifier: formData.get("identifier"), password: formData.get("password") });
    if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Champs invalides." };
    const resolved = await resolveLoginIdentifier(parsed.data.identifier);
    if (!resolved) return { status: "error", message: "Identifiants incorrects. Première connexion ? Utilisez le bouton ci-dessous." };
    email = resolved;
    password = parsed.data.password;
  } else {
    const parsed = passwordLoginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
    if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Champs invalides." };
    email = parsed.data.email;
    password = parsed.data.password;
  }

  if (!isAllowedEmail(email)) {
    return { status: "error", message: notAllowedMessage() };
  }
  if (await tempPasswordExpired(email)) {
    return { status: "error", message: "Votre mot de passe temporaire a expiré. Refaites une première connexion pour en recevoir un nouveau." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.status === 429) {
      return { status: "error", message: "Trop de tentatives. Patientez quelques minutes." };
    }
    return {
      status: "error",
      message: auth.firstAccess === "registry" ? "Identifiants incorrects. Première connexion ou mot de passe oublié ? Utilisez les boutons ci-dessous." : "Identifiants incorrects. Première connexion ou mot de passe oublié ? Demandez un lien ci-dessous.",
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
