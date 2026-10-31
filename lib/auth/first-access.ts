import "server-only";

import { createHash, randomInt } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail } from "@/lib/email/transport";
import { escapeHtml, layout } from "@/lib/email/layout";
import { siteUrl } from "@/lib/email/site";
import { APP_NAME } from "@/lib/config";
import { isAllowedEmail } from "@/lib/auth/domains";
import { appMailConfigured } from "@/lib/auth/invite";

/**
 * Première connexion par matricule (réglage auth_first_access = "registry") :
 *  1. l'agent saisit son adresse @sdis62.fr, son matricule et une adresse personnelle ;
 *  2. le matricule doit figurer dans le référentiel importé par les administrateurs
 *     (agents_registry) ; s'il y porte une adresse SDIS, elle doit correspondre ;
 *  3. le compte est créé (ou retrouvé s'il n'a jamais servi) avec un mot de passe temporaire
 *     envoyé sur l'adresse personnelle, valable sept jours ;
 *  4. à la connexion (e-mail ou matricule), l'accueil impose un mot de passe personnel.
 * Un compte déjà accueilli n'est jamais réinitialisé par ce chemin (l'adresse personnelle
 * saisie n'est pas vérifiée) : il passe par « mot de passe oublié ».
 */
export type FirstAccessInput = { email: string; matricule: string; personalEmail: string };
export type FirstAccessResult = { ok: true; personalEmail: string } | { ok: false; error: string; field?: "email" | "matricule" | "personalEmail" };

export const TEMP_PASSWORD_DAYS = 7;

/** Matricule normalisé : majuscules, sans espaces ni tirets. */
import { MATRICULE_RE, normalizeMatricule } from "@/lib/auth/first-access-public";
export { normalizeMatricule };

/** Mot de passe temporaire lisible : 12 caractères sans ambiguïté (pas de 0/O, 1/l/I). */
export function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 12; i++) out += alphabet[randomInt(alphabet.length)];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8)}`;
}

function bucketId(seed: string): string {
  const h = createHash("sha256").update(seed.toLowerCase()).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** E-mail ou matricule saisi sur l'écran de connexion → adresse du compte. */
export async function resolveLoginIdentifier(identifier: string): Promise<string | null> {
  const id = identifier.trim();
  if (id.includes("@")) return id.toLowerCase();
  const matricule = normalizeMatricule(id);
  if (!matricule) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("email").ilike("matricule", matricule).maybeSingle();
  return data?.email ?? null;
}

/** Mot de passe temporaire périmé (compte jamais accueilli) : la connexion est refusée. */
export async function tempPasswordExpired(email: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("password_set_at, temp_password_expires_at").ilike("email", email).maybeSingle();
  if (!data || data.password_set_at || !data.temp_password_expires_at) return false;
  return new Date(data.temp_password_expires_at).getTime() < Date.now();
}

export async function requestFirstAccess(input: FirstAccessInput, clientKey = ""): Promise<FirstAccessResult> {
  const email = input.email.trim().toLowerCase();
  const personalEmail = input.personalEmail.trim().toLowerCase();
  const matricule = normalizeMatricule(input.matricule);
  if (!isAllowedEmail(email)) return { ok: false, error: "Utilisez votre adresse professionnelle du SDIS 62.", field: "email" };
  if (!matricule || !MATRICULE_RE.test(matricule)) return { ok: false, error: "Matricule invalide (3 à 12 lettres ou chiffres).", field: "matricule" };
  if (personalEmail === email) return { ok: false, error: "Indiquez une adresse personnelle, différente de l'adresse du SDIS.", field: "personalEmail" };
  if (!appMailConfigured()) return { ok: false, error: "L'envoi d'e-mails n'est pas configuré sur ce déploiement : contactez le service communication." };

  const admin = createAdminClient();
  // Garde-fou : 5 demandes par matricule et par heure, 10 par appareil
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  for (const [seed, max] of [[`m:${matricule}`, 5], [`c:${clientKey || matricule}`, 10]] as const) {
    const { count } = await admin.from("rate_limit_events").select("bucket", { count: "exact", head: true }).eq("user_id", bucketId(seed)).eq("bucket", "first_access").gte("created_at", since);
    if ((count ?? 0) >= max) return { ok: false, error: "Trop de demandes. Patientez une heure avant de réessayer." };
  }
  await admin.from("rate_limit_events").insert({ user_id: bucketId(`m:${matricule}`), bucket: "first_access" });
  if (clientKey) await admin.from("rate_limit_events").insert({ user_id: bucketId(`c:${clientKey}`), bucket: "first_access" });

  // Référentiel : le matricule doit exister, et correspondre à l'adresse SDIS s'il en porte une
  const { data: ref } = await admin.from("agents_registry").select("matricule, email, first_name, last_name, status").eq("matricule", matricule).maybeSingle();
  if (!ref) return { ok: false, error: "Ce matricule n'est pas référencé. Vérifiez-le ; s'il est exact, contactez le service communication.", field: "matricule" };
  if (ref.email && ref.email.trim().toLowerCase() !== email) return { ok: false, error: "Cette adresse ne correspond pas au matricule indiqué.", field: "email" };

  // Compte existant ?
  const [{ data: byEmail }, { data: byMatricule }] = await Promise.all([
    admin.from("profiles").select("id, email, matricule, personal_email, password_set_at, onboarded_at, is_active").ilike("email", email).maybeSingle(),
    admin.from("profiles").select("id, email, matricule, personal_email, password_set_at, onboarded_at, is_active").ilike("matricule", matricule).maybeSingle(),
  ]);
  if (byMatricule && byMatricule.email !== email) return { ok: false, error: "Ce matricule est déjà rattaché à un autre compte. Contactez le service communication.", field: "matricule" };
  const existing = byEmail ?? byMatricule;
  if (existing) {
    if (!existing.is_active) return { ok: false, error: "Ce compte est désactivé. Contactez le service communication." };
    if (existing.password_set_at || existing.onboarded_at) return { ok: false, error: "Un compte existe déjà pour cette adresse. Connectez-vous, ou utilisez « Mot de passe oublié »." , field: "email" };
    if (existing.personal_email && existing.personal_email !== personalEmail) return { ok: false, error: "Une demande existe déjà pour ce compte avec une autre adresse personnelle. Contactez le service communication.", field: "personalEmail" };
  }

  const password = generateTempPassword();
  const expires = new Date(Date.now() + TEMP_PASSWORD_DAYS * 86_400_000).toISOString();
  let userId = existing?.id ?? null;
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: ref.first_name ?? "", last_name: ref.last_name ?? "" },
    });
    if (error || !data.user) {
      if (/DOMAINE_NON_AUTORISE|Database error/i.test(error?.message ?? "")) return { ok: false, error: "Cette adresse n'est pas autorisée.", field: "email" };
      return { ok: false, error: "Création du compte impossible pour le moment. Réessayez." };
    }
    userId = data.user.id;
  } else {
    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) return { ok: false, error: "Mise à jour du compte impossible pour le moment. Réessayez." };
  }
  const { error: profileError } = await admin
    .from("profiles")
    .update({ matricule, personal_email: personalEmail, status: ref.status ?? null, password_set_at: null, temp_password_expires_at: expires, ...(ref.first_name ? { first_name: ref.first_name } : {}), ...(ref.last_name ? { last_name: ref.last_name } : {}) })
    .eq("id", userId);
  if (profileError) return { ok: false, error: "Enregistrement du profil impossible. Réessayez." };

  const sent = await sendTempPasswordEmail({ to: personalEmail, email, matricule, password, firstName: ref.first_name ?? "" });
  if (!sent) return { ok: false, error: "L'e-mail n'a pas pu partir. Réessayez dans quelques minutes." };
  return { ok: true, personalEmail };
}

async function sendTempPasswordEmail({ to, email, matricule, password, firstName }: { to: string; email: string; matricule: string; password: string; firstName: string }): Promise<boolean> {
  const base = siteUrl();
  const hello = firstName ? `Bonjour ${escapeHtml(firstName)},` : "Bonjour,";
  const intro = `${hello} votre accès à ${APP_NAME}, l'application interne du SDIS 62, est prêt. Connectez-vous avec votre adresse <strong>${escapeHtml(email)}</strong> ou votre matricule <strong>${escapeHtml(matricule)}</strong> et le mot de passe temporaire ci-dessous. À la première connexion, vous choisirez votre mot de passe personnel.`;
  const footer = `Mot de passe temporaire valable ${TEMP_PASSWORD_DAYS} jours. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.`;
  const html = layout({ title: `Bienvenue sur ${APP_NAME}`, intro, code: password, buttons: [{ label: "Ouvrir ATLAS", href: `${base}/login` }], footer });
  const text = `Bienvenue sur ${APP_NAME}\n\n${intro.replace(/<[^>]+>/g, "")}\n\nIdentifiant : ${email} (ou ${matricule})\nMot de passe temporaire : ${password}\n\nConnexion : ${base}/login\n\n${footer}`;
  return sendMail({ to, subject: `${APP_NAME} · votre accès`, html, text });
}
