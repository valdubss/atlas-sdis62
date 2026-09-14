import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
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

  const supabase = await createClient();
  const { data: centers } = await supabase.from("centers").select("id, name").eq("is_active", true).order("sort_order").order("name");

  return (
    <Onboarding
      firstName={profile.first_name}
      lastName={profile.last_name}
      centerId={profile.center_id}
      centers={centers ?? []}
      needPassword={mdp === "1"}
      startAtForm={Boolean(profile.onboarded_at)}
      key={profile.onboarded_at ? "reset" : "first"}
    />
  );
}
