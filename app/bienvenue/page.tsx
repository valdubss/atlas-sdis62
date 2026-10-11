import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { NOTE_ROLE_LABELS } from "@/lib/centres/notes";
import { fetchDirectory } from "@/lib/centres/public";
import { Onboarding } from "./Onboarding";

export const metadata: Metadata = { title: "Bienvenue" };
export const dynamic = "force-dynamic";

/**
 * Accueil de première connexion. `?mdp=1` : arrivée par lien e-mail, le mot de
 * passe est à définir. Un profil déjà accueilli qui arrive par lien (mot de passe
 * oublié) revoit seulement l'étape formulaire.
 */
export default async function BienvenuePage({ searchParams }: { searchParams: Promise<{ mdp?: string }> }) {
  const { mdp } = await searchParams;
  const current = await getCurrentUser();
  if (!current) redirect("/auth/deconnexion?raison=profil");
  const { profile } = current;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const passwordSet = (user?.app_metadata as { password_set?: boolean } | undefined)?.password_set === true;
  if (profile.onboarded_at && mdp !== "1" && passwordSet) redirect("/");
  // Mot de passe obligatoire : exigé à la première connexion, après un lien « mot de passe oublié »,
  // et pour tout compte qui n'en a pas encore
  const passwordRequired = !passwordSet || mdp === "1";

  const [directory, presetRole] = await Promise.all([
    fetchDirectory(),
    // Chef de centre ou responsable com : déjà rattaché d'office par le trigger, l'accueil le dit
    profile.center_id ? supabase.rpc("center_author_role", { p_center: profile.center_id, p_profile: profile.id }).then((r) => (r.data === "chief" || r.data === "com" ? NOTE_ROLE_LABELS[r.data] : null)) : Promise.resolve(null),
  ]);

  return (
    <Onboarding
      firstName={profile.first_name}
      lastName={profile.last_name}
      centerId={profile.center_id}
      presetRole={presetRole}
      directory={directory}
      needPassword={passwordRequired}
      passwordRequired={passwordRequired}
      startAtForm={Boolean(profile.onboarded_at)}
      key={profile.onboarded_at ? "reset" : "first"}
    />
  );
}
