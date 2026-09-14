import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, SectionTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EcgDivider } from "@/components/brand/Ecg";
import { createClient, getCurrentUser, isEditorRole } from "@/lib/supabase/server";
import { ROLE_LABELS } from "@/lib/config";
import { ProfileForm } from "./ProfileForm";
import { PasswordForm } from "./PasswordForm";
import { signOut } from "./actions";

export const metadata: Metadata = { title: "Profil" };

export default async function ProfilPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/auth/deconnexion?raison=profil");
  const { profile } = current;

  const supabase = await createClient();
  const { data: centers } = await supabase
    .from("centers")
    .select("*")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");

  const incomplete = !profile.first_name || !profile.last_name;
  const initials =
    (profile.first_name[0] ?? "") + (profile.last_name[0] ?? "") || profile.email[0];

  return (
    <div className="space-y-6 px-4 sm:px-0">
      <SectionTitle>Profil</SectionTitle>

      <Card className="p-5">
        <div className="flex items-center gap-4">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-surface-2 font-display text-2xl font-bold uppercase text-ink ring-1 ring-line-strong"
            aria-hidden="true"
          >
            {initials.toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate font-display text-xl font-bold uppercase text-ink">
              {incomplete ? "Bienvenue" : `${profile.first_name} ${profile.last_name}`}
            </p>
            <p className="truncate text-sm text-muted">{profile.email}</p>
            <span className="mt-1 inline-block rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-navy">
              {ROLE_LABELS[profile.role]}
            </span>
          </div>
        </div>

        {incomplete && (
          <p className="mt-4 rounded-xl bg-red/5 px-3 py-2 text-sm text-red-text" role="status">
            Complétez votre prénom et votre nom : ils apparaissent dans vos commentaires.
          </p>
        )}

        <EcgDivider className="my-5" />

        <ProfileForm profile={profile} centers={centers ?? []} />
      </Card>

      {isEditorRole(profile.role) && (
        <Card className="flex items-center justify-between p-5">
          <div>
            <p className="font-semibold text-ink">Espace éditeur</p>
            <p className="text-sm text-muted">Publier et modérer les contenus.</p>
          </div>
          <Link
            href="/studio"
            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-bg hover:bg-white/90"
          >
            Ouvrir le studio
          </Link>
        </Card>
      )}

      <Card className="p-5">
        <p className="font-semibold text-ink">Mot de passe</p>
        <p className="mb-4 text-sm text-muted">
          Facultatif : permet de se connecter sans attendre le lien par e-mail.
        </p>
        <PasswordForm />
      </Card>

      <Card className="space-y-3 p-5">
        <p className="text-sm text-muted">
          <Link href="/a-propos" className="font-semibold text-navy underline-offset-2 hover:underline">
            À propos, charte et données personnelles
          </Link>
        </p>
        <form action={signOut}>
          <Button type="submit" variant="ghost" className="w-full">
            Se déconnecter
          </Button>
        </form>
      </Card>
    </div>
  );
}
