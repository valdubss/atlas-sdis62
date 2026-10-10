import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
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
  if (profile.onboarded_at && mdp !== "1") redirect("/");
  // Première connexion par lien ou code : le mot de passe est proposé (facultatif)
  const offerPassword = mdp === "1" || !profile.onboarded_at;

  const directory = await fetchDirectory();

  return (
    <Onboarding
      firstName={profile.first_name}
      lastName={profile.last_name}
      centerId={profile.center_id}
      directory={directory}
      needPassword={offerPassword}
      startAtForm={Boolean(profile.onboarded_at)}
      key={profile.onboarded_at ? "reset" : "first"}
    />
  );
}
