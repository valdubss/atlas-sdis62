import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAllowedDomains } from "@/lib/auth/domains";
import { MATRICULE_RE, normalizeMatricule, normalizeName } from "@/lib/auth/first-access-public";

/**
 * Première connexion par matricule (réglage auth_first_access = "registry"), sans aucun
 * e-mail : l'agent est autonome, le chef de centre ne valide ensuite que son rattachement.
 *  1. l'agent saisit matricule, nom et prénom ;
 *  2. le matricule doit figurer dans le référentiel importé par les administrateurs
 *     (agents_registry) et, si la liste porte un nom, nom et prénom doivent correspondre
 *     (accents, casse, espaces et tirets ignorés) ; sinon refus immédiat ;
 *  3. le compte est créé (adresse de la liste, ou <matricule>@<domaine> si la liste n'en a pas :
 *     les adresses SDIS de la plupart des volontaires n'existent pas) et la session est ouverte
 *     aussitôt par l'action serveur : l'accueil enchaîne statut, centre (obligatoire, validé par le
 *     chef de centre) et mot de passe personnel.
 * Un matricule déjà rattaché à un compte accueilli n'est jamais réinitialisé par ce chemin.
 */
export type FirstAccessInput = { matricule: string; lastName: string; firstName: string };
export type FirstAccessResult = { ok: true; email: string; password: string } | { ok: false; error: string; field?: "matricule" | "lastName" | "firstName" };

export { normalizeMatricule };

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

/** Adresse technique d'un agent sans adresse dans la liste : <matricule>@<premier domaine autorisé>. */
function syntheticEmail(matricule: string): string {
  const domain = getAllowedDomains()[0] ?? "sdis62.fr";
  return `${matricule.toLowerCase()}@${domain}`;
}

export async function requestFirstAccess(input: FirstAccessInput, clientKey = ""): Promise<FirstAccessResult> {
  const matricule = normalizeMatricule(input.matricule);
  const lastName = input.lastName.trim();
  const firstName = input.firstName.trim();
  if (!matricule || !MATRICULE_RE.test(matricule)) return { ok: false, error: "Matricule invalide (3 à 12 lettres ou chiffres).", field: "matricule" };

  const admin = createAdminClient();
  // Garde-fou : 5 tentatives par matricule et par heure, 10 par appareil
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  for (const [seed, max] of [[`m:${matricule}`, 5], [`c:${clientKey || matricule}`, 10]] as const) {
    const { count } = await admin.from("rate_limit_events").select("bucket", { count: "exact", head: true }).eq("user_id", bucketId(seed)).eq("bucket", "first_access").gte("created_at", since);
    if ((count ?? 0) >= max) return { ok: false, error: "Trop de tentatives. Patientez une heure avant de réessayer." };
  }
  await admin.from("rate_limit_events").insert({ user_id: bucketId(`m:${matricule}`), bucket: "first_access" });
  if (clientKey) await admin.from("rate_limit_events").insert({ user_id: bucketId(`c:${clientKey}`), bucket: "first_access" });

  // Référentiel : le matricule doit exister et le nom correspondre à celui de la liste
  const { data: ref } = await admin.from("agents_registry").select("matricule, email, first_name, last_name, status").eq("matricule", matricule).maybeSingle();
  if (!ref) return { ok: false, error: "Ce matricule n'est pas référencé. Vérifiez-le ; s'il est exact, contactez le service communication.", field: "matricule" };
  if (ref.last_name && normalizeName(ref.last_name) !== normalizeName(lastName)) return { ok: false, error: "Ce nom ne correspond pas au matricule indiqué.", field: "lastName" };
  if (ref.first_name && normalizeName(ref.first_name) !== normalizeName(firstName)) return { ok: false, error: "Ce prénom ne correspond pas au matricule indiqué.", field: "firstName" };

  const email = (ref.email ?? "").trim().toLowerCase() || syntheticEmail(matricule);
  const [{ data: byMatricule }, { data: byEmail }] = await Promise.all([
    admin.from("profiles").select("id, email, password_set_at, onboarded_at, is_active").ilike("matricule", matricule).maybeSingle(),
    admin.from("profiles").select("id, email, password_set_at, onboarded_at, is_active").ilike("email", email).maybeSingle(),
  ]);
  const existing = byMatricule ?? byEmail;
  if (existing) {
    if (!existing.is_active) return { ok: false, error: "Ce compte est désactivé. Contactez le service communication." };
    if (existing.password_set_at || existing.onboarded_at) return { ok: false, error: "Un compte existe déjà pour ce matricule : connectez-vous. Mot de passe oublié ? Le service communication vous remet un mot de passe provisoire.", field: "matricule" };
  }

  // Mot de passe jetable, connu du seul serveur : sert à ouvrir la session, puis l'accueil
  // impose un mot de passe personnel (password_set_at vide)
  const password = randomBytes(24).toString("base64url");
  let userId = existing?.id ?? null;
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: ref.first_name ?? firstName, last_name: ref.last_name ?? lastName },
    });
    if (error || !data.user) {
      if (/DOMAINE_NON_AUTORISE|Database error/i.test(error?.message ?? "")) return { ok: false, error: "L'adresse associée à ce matricule n'est pas autorisée. Contactez le service communication." };
      return { ok: false, error: "Création du compte impossible pour le moment. Réessayez." };
    }
    userId = data.user.id;
  } else {
    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) return { ok: false, error: "Mise à jour du compte impossible pour le moment. Réessayez." };
  }
  const { error: profileError } = await admin
    .from("profiles")
    .update({ matricule, status: ref.status ?? null, password_set_at: null, first_name: ref.first_name ?? firstName, last_name: ref.last_name ?? lastName })
    .eq("id", userId);
  if (profileError) return { ok: false, error: "Enregistrement du profil impossible. Réessayez." };
  return { ok: true, email: existing?.email ?? email, password };
}
