import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { PageHeader } from "@/components/layout/PageHeader";
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
  const { data: centers } = await supabase.from("centers").select("*").eq("is_active", true).order("sort_order").order("name");

  const incomplete = !profile.first_name || !profile.last_name;
  const fullName = `${profile.first_name} ${profile.last_name}`.trim();

  return (
    <div className="space-y-3">
      <PageHeader title="Profil" />

      <section className="flex items-center gap-4 rounded-[16px] bg-bg-1 px-5 py-4">
        <Avatar name={fullName || profile.email} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-[17px] font-semibold tracking-[-0.02em] text-text-1">{incomplete ? "Bienvenue" : fullName}</p>
          <p className="truncate text-[13px] text-text-3">{profile.email}</p>
          <p className="text-[13px] text-text-2">{ROLE_LABELS[profile.role]}</p>
        </div>
      </section>

      {incomplete && (
        <p role="status" className="rounded-[16px] bg-bg-1 px-5 py-3 text-[15px] text-text-2">
          Complétez votre prénom et votre nom : ils apparaissent dans vos commentaires.
        </p>
      )}

      <section className="rounded-[16px] bg-bg-1 px-5 py-4">
        <ProfileForm profile={profile} centers={centers ?? []} />
      </section>

      {isEditorRole(profile.role) && (
        <Link href="/studio" className="pressable flex items-center justify-between rounded-[16px] bg-bg-1 px-5 py-4">
          <span>
            <span className="block text-[15px] text-text-1">Studio</span>
            <span className="block text-[13px] text-text-3">Publier et modérer les contenus</span>
          </span>
          <ChevronRight size={20} strokeWidth={1.75} className="text-text-3" />
        </Link>
      )}

      <section className="rounded-[16px] bg-bg-1 px-5 py-4">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">Mot de passe</h2>
        <p className="mb-4 mt-1 text-[13px] text-text-3">Facultatif : permet de se connecter sans attendre le lien par e-mail.</p>
        <PasswordForm />
      </section>

      <div className="hairline rounded-[16px] bg-bg-1">
        <Link href="/a-propos" className="pressable flex h-12 items-center justify-between px-5 text-[15px] text-text-1">
          À propos, charte et données personnelles
          <ChevronRight size={20} strokeWidth={1.75} className="text-text-3" />
        </Link>
        <form action={signOut} className="px-5 py-2">
          <Button type="submit" variant="tertiary" className="w-full">
            Se déconnecter
          </Button>
        </form>
      </div>
    </div>
  );
}
