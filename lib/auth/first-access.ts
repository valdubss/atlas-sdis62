import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { appMailConfigured, sendAccountEmail } from "@/lib/auth/invite";
import { MATRICULE_RE, normalizeMatricule } from "@/lib/auth/first-access-public";

/**
 * Première connexion par matricule (réglage auth_first_access = "registry") :
 *  1. l'agent saisit son matricule, sa date de naissance et son adresse personnelle (l'adresse
 *     SDIS, quand la liste la connaît, reste un identifiant de connexion) ;
 *  2. le matricule et la date de naissance doivent correspondre à la liste importée par les
 *     administrateurs (agents_registry), sinon refus immédiat, rien ne part ; le message est le
 *     même que le matricule soit inconnu, sans date ou avec une autre date (pas de sondage) ;
 *  3. le compte est créé avec l'adresse personnelle pour identité (tous les codes et liens y
 *     partent ; l'adresse est inscrite dans le référentiel pour passer le contrôle des domaines),
 *     nom et prénom repris de la liste, puis un e-mail d'ATLAS envoie le code à six chiffres ;
 *  4. le code ouvre la session : un seul écran d'accueil (centre validé par le chef de centre,
 *     mot de passe, statut s'il manque dans la liste), puis l'agent arrive directement dans le fil.
 *     Connexions suivantes : e-mail (personnelle ou SDIS) ou matricule.
 * Un compte déjà accueilli n'est jamais réinitialisé par ce chemin : « mot de passe oublié ».
 */
export type FirstAccessInput = { matricule: string; personalEmail: string; birthDate: string };
export type FirstAccessResult = { ok: true; personalEmail: string } | { ok: false; error: string; field?: "matricule" | "personalEmail" };

export { normalizeMatricule };

function bucketId(seed: string): string {
  const h = createHash("sha256").update(seed.toLowerCase()).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * Identifiant saisi (e-mail personnelle, e-mail SDIS ou matricule) → adresse du compte.
 * `known` : l'adresse correspond à un compte existant (le contrôle des domaines ne s'applique
 * plus, l'adresse personnelle a été acceptée à la création).
 */
export async function resolveLoginIdentifier(identifier: string): Promise<{ email: string; known: boolean } | null> {
  const id = identifier.trim();
  const admin = createAdminClient();
  if (id.includes("@")) {
    const email = id.toLowerCase();
    const { data: byEmail } = await admin.from("profiles").select("email").ilike("email", email).maybeSingle();
    if (byEmail?.email) return { email: byEmail.email, known: true };
    // Adresse SDIS indicative : retrouvée par le référentiel, puis le matricule
    const { data: ref } = await admin.from("agents_registry").select("matricule").ilike("email", email).maybeSingle();
    if (ref) {
      const { data: p } = await admin.from("profiles").select("email").ilike("matricule", ref.matricule).maybeSingle();
      if (p?.email) return { email: p.email, known: true };
    }
    return { email, known: false };
  }
  const matricule = normalizeMatricule(id);
  if (!matricule) return null;
  const { data } = await admin.from("profiles").select("email").ilike("matricule", matricule).maybeSingle();
  return data?.email ? { email: data.email, known: true } : null;
}

export async function requestFirstAccess(input: FirstAccessInput, clientKey = ""): Promise<FirstAccessResult> {
  const personalEmail = input.personalEmail.trim().toLowerCase();
  const matricule = normalizeMatricule(input.matricule);
  if (!matricule || !MATRICULE_RE.test(matricule)) return { ok: false, error: "Matricule invalide (3 à 12 lettres ou chiffres).", field: "matricule" };
  if (!appMailConfigured()) return { ok: false, error: "L'envoi d'e-mails n'est pas configuré sur ce déploiement : contactez le service communication." };

  const admin = createAdminClient();
  // Garde-fou : 5 demandes par matricule et par heure, 60 par adresse IP (une caserne entière
  // partage souvent la même adresse publique : les inscriptions groupées sur le wifi du centre
  // ne doivent pas se bloquer entre elles ; le plafond par matricule protège chaque agent)
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  for (const [seed, max] of [[`m:${matricule}`, 5], [`c:${clientKey || matricule}`, 60]] as const) {
    const { count } = await admin.from("rate_limit_events").select("bucket", { count: "exact", head: true }).eq("user_id", bucketId(seed)).eq("bucket", "first_access").gte("created_at", since);
    if ((count ?? 0) >= max) return { ok: false, error: "Trop de demandes. Patientez une heure avant de réessayer." };
  }
  await admin.from("rate_limit_events").insert({ user_id: bucketId(`m:${matricule}`), bucket: "first_access" });
  if (clientKey) await admin.from("rate_limit_events").insert({ user_id: bucketId(`c:${clientKey}`), bucket: "first_access" });

  // Référentiel : le matricule doit exister, avec la même date de naissance
  const { data: ref } = await admin.from("agents_registry").select("matricule, email, personal_email, first_name, last_name, status, birth_date").eq("matricule", matricule).maybeSingle();
  if (!ref || !ref.birth_date || ref.birth_date !== input.birthDate)
    return { ok: false, error: "Matricule ou date de naissance incorrects. Vérifiez-les ; s'ils sont exacts, contactez le service communication.", field: "matricule" };

  // Compte existant ? Par matricule (déjà activé) ou par adresse personnelle (autre agent)
  const [{ data: byMatricule }, { data: byPersonal }] = await Promise.all([
    admin.from("profiles").select("id, email, matricule, password_set_at, onboarded_at, is_active").ilike("matricule", matricule).maybeSingle(),
    admin.from("profiles").select("id, email, matricule, password_set_at, onboarded_at, is_active").ilike("email", personalEmail).maybeSingle(),
  ]);
  if (byPersonal && byPersonal.matricule && byPersonal.matricule.toUpperCase() !== matricule) return { ok: false, error: "Cette adresse est déjà utilisée par un autre compte.", field: "personalEmail" };
  const existing = byMatricule ?? byPersonal;
  if (existing) {
    if (!existing.is_active) return { ok: false, error: "Ce compte est désactivé. Contactez le service communication." };
    if (existing.password_set_at || existing.onboarded_at) return { ok: false, error: "Un compte existe déjà pour ce matricule : connectez-vous, ou utilisez « Mot de passe oublié ».", field: "matricule" };
  }

  // L'adresse personnelle passe le contrôle des domaines (fonction is_allowed_email) via le référentiel
  const { error: refError } = await admin
    .from("agents_registry")
    .update({ personal_email: personalEmail })
    .eq("matricule", matricule);
  if (refError) return { ok: false, error: "Enregistrement impossible pour le moment. Réessayez." };

  let userId = existing?.id ?? null;
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({
      email: personalEmail,
      email_confirm: true,
      user_metadata: { first_name: ref.first_name ?? "", last_name: ref.last_name ?? "" },
    });
    if (error || !data.user) {
      if (/DOMAINE_NON_AUTORISE|Database error/i.test(error?.message ?? "")) return { ok: false, error: "Cette adresse n'est pas acceptée. Contactez le service communication.", field: "personalEmail" };
      return { ok: false, error: "Création du compte impossible pour le moment. Réessayez." };
    }
    userId = data.user.id;
  } else if (existing && existing.email.toLowerCase() !== personalEmail) {
    // Demande reprise avec une autre adresse personnelle (compte jamais accueilli) : l'adresse suit
    const { error } = await admin.auth.admin.updateUserById(userId, { email: personalEmail, email_confirm: true });
    if (error) return { ok: false, error: "Mise à jour du compte impossible pour le moment. Réessayez." };
  }
  const { error: profileError } = await admin
    .from("profiles")
    .update({ matricule, personal_email: personalEmail, status: ref.status ?? null, password_set_at: null, ...(ref.first_name ? { first_name: ref.first_name } : {}), ...(ref.last_name ? { last_name: ref.last_name } : {}) })
    .eq("id", userId);
  if (profileError) return { ok: false, error: "Enregistrement du profil impossible. Réessayez." };

  const sent = await sendAccountEmail("invite", personalEmail, { firstName: ref.first_name ?? undefined, codeInSubject: true });
  if (!sent.ok) return { ok: false, error: "L'e-mail n'a pas pu partir. Réessayez dans quelques minutes." };
  return { ok: true, personalEmail };
}

/** À l'accueil terminé : trace d'activation dans le référentiel (visible par les administrateurs). */
export async function markRegistryActivated(matricule: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("agents_registry").update({ activated_at: new Date().toISOString() }).eq("matricule", normalizeMatricule(matricule));
}
