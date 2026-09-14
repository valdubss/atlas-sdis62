import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/Logo";
import { getCurrentUser } from "@/lib/supabase/server";
import { OnboardingForm } from "./OnboardingForm";

export const metadata: Metadata = { title: "Bienvenue" };
export const dynamic = "force-dynamic";

/**
 * Première connexion (arrivée par le lien e-mail) : prénom, nom et mot de passe.
 * Sert aussi pour « mot de passe oublié ».
 */
export default async function BienvenuePage() {
  const current = await getCurrentUser();
  if (!current) redirect("/auth/deconnexion?raison=profil");
  const { profile } = current;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-bg-0 px-5 py-10">
      <div className="w-full max-w-[420px] space-y-6">
        <div className="flex justify-center">
          <Logo height={40} />
        </div>
        <section className="rounded-[22px] bg-bg-1 p-5 sm:p-6">
          <p className="text-[22px] font-semibold tracking-[-0.02em] text-text-1">
            {profile.first_name ? `Bonjour ${profile.first_name}` : "Bienvenue"}
          </p>
          <p className="mt-1 text-[15px] text-text-2">
            {profile.first_name ? "Choisissez votre nouveau mot de passe." : "Complétez votre profil et choisissez un mot de passe pour vos prochaines connexions."}
          </p>
          <div className="mt-5">
            <OnboardingForm firstName={profile.first_name} lastName={profile.last_name} />
          </div>
        </section>
      </div>
    </main>
  );
}
