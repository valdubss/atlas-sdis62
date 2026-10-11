import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail } from "@/lib/email/transport";
import { APP_NAME } from "@/lib/config";
import { siteUrl } from "@/lib/email/site";
import { escapeHtml, layout } from "@/lib/email/layout";

import { createHash } from "node:crypto";

type LinkKind = "invite" | "magiclink" | "recovery";

/** Transport e-mail de l'app configuré (Resend ou SMTP) ? Sinon, Supabase envoie ses e-mails standard. */
export function appMailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY || process.env.SMTP_HOST);
}

/** Identifiant stable dérivé de l'adresse (table rate_limit_events, avant toute session). */
function emailBucketId(email: string): string {
  const h = createHash("sha256").update(email.toLowerCase()).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * E-mail de connexion demandé depuis l'écran de connexion : compte créé s'il
 * n'existe pas (domaine vérifié par le trigger SQL), puis lien + code envoyés
 * par notre transport. Trois envois par adresse et par dix minutes.
 */
export async function sendLoginEmailFor(email: string): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const bucketUser = emailBucketId(email);
  const { count } = await admin.from("rate_limit_events").select("bucket", { count: "exact", head: true }).eq("user_id", bucketUser).eq("bucket", "magiclink").gte("created_at", since);
  if ((count ?? 0) >= 3) return { ok: false, error: "Trop de demandes. Patientez quelques minutes avant de réessayer.", status: 429 };
  await admin.from("rate_limit_events").insert({ user_id: bucketUser, bucket: "magiclink" });

  // Le compte existe-t-il ? (recherche exacte, insensible à la casse)
  const { data: profile } = await admin.from("profiles").select("id, first_name, onboarded_at, is_active").ilike("email", email).maybeSingle();
  if (profile && !profile.is_active) return { ok: false, error: "Ce compte est désactivé. Contactez le service communication." };
  if (!profile) {
    const { error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error && !/already|exists|registered/i.test(error.message)) {
      if (/DOMAINE_NON_AUTORISE|Database error/i.test(error.message)) return { ok: false, error: "Cette adresse n'est pas autorisée." };
      return { ok: false, error: "Envoi impossible pour le moment. Réessayez." };
    }
  }
  return sendAccountEmail(profile?.onboarded_at ? "recovery" : "invite", email, { firstName: profile?.first_name });
}

/**
 * E-mails de compte envoyés par ATLAS lui-même (Resend ou SMTP) : invitation
 * d'un nouvel agent, nouveau lien de connexion, réinitialisation du mot de passe.
 * Le lien et le code à six chiffres viennent de l'API d'administration Supabase ;
 * l'e-mail part par notre transport, sans dépendre du SMTP de Supabase.
 * Renvoie false si aucun transport n'est configuré (l'appelant prévient l'admin).
 */
export async function sendAccountEmail(kind: LinkKind, email: string, opts: { firstName?: string; by?: string } = {}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const base = siteUrl();
  // Première connexion et mot de passe oublié arrivent sur l'écran qui fait choisir le mot de passe
  const next = kind === "magiclink" ? "/" : "/bienvenue?mdp=1";
  const { data, error } = await admin.auth.admin.generateLink({
    type: kind === "invite" ? "magiclink" : kind,
    email,
    options: { redirectTo: `${base}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.properties?.hashed_token) return { ok: false, error: error?.message ?? "Lien impossible à générer." };
  const { hashed_token, email_otp, verification_type } = data.properties;
  const url = `${base}/auth/callback?type=${encodeURIComponent(verification_type || (kind === "recovery" ? "recovery" : "magiclink"))}&token_hash=${encodeURIComponent(hashed_token)}&next=${encodeURIComponent(next)}`;
  const hello = opts.firstName ? `Bonjour ${escapeHtml(opts.firstName)},` : "Bonjour,";
  const copy = {
    invite: {
      subject: `${APP_NAME} · votre accès`,
      title: `Bienvenue sur ${APP_NAME}`,
      intro: `${hello} ${opts.by ? escapeHtml(opts.by) + " vous a ouvert un accès à " : "un accès vous a été ouvert à "}${APP_NAME}, l'application interne du SDIS 62. Touchez le bouton pour définir votre mot de passe et commencer ; vous pouvez aussi saisir le code ci-dessous sur l'écran de connexion.`,
      button: "Définir mon mot de passe",
    },
    magiclink: {
      subject: `${APP_NAME} · connexion`,
      title: "Votre connexion",
      intro: `${hello} voici votre lien de connexion. Vous pouvez aussi saisir le code ci-dessous sur l'écran de connexion.`,
      button: "Me connecter",
    },
    recovery: {
      subject: `${APP_NAME} · nouveau mot de passe`,
      title: "Nouveau mot de passe",
      intro: `${hello} touchez le bouton pour choisir un nouveau mot de passe. Vous pouvez aussi saisir le code ci-dessous sur l'écran de connexion.`,
      button: "Choisir un mot de passe",
    },
  }[kind];
  const text = `${copy.title}\n\n${copy.intro.replace(/<[^>]+>/g, "")}\n\nLien : ${url}\nCode : ${email_otp ?? "(voir le lien)"}\n\nValable quinze minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.`;
  const html = layout({ title: copy.title, intro: copy.intro, code: email_otp ?? undefined, buttons: [{ label: copy.button, href: url }], footer: "Valable quinze minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail." });
  const sent = await sendMail({ to: email, subject: copy.subject, html, text });
  if (!sent) {
    // Pas de transport ATLAS (RESEND_API_KEY ou SMTP_HOST) : Supabase envoie son e-mail standard
    // (modèle anglais non modifiable, quelques envois par heure). Provisoire : voir README § 3.5.
    const fallback = kind === "recovery"
      ? await admin.auth.resetPasswordForEmail(email, { redirectTo: `${base}/auth/callback?next=${encodeURIComponent(next)}` })
      : await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${base}/auth/callback?next=${encodeURIComponent(next)}` });
    if (fallback.error) return { ok: false, error: "Envoi impossible pour le moment. Réessayez dans quelques minutes." };
  }
  return { ok: true };
}
