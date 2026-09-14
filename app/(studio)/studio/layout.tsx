import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/Logo";
import { ROLE_LABELS } from "@/lib/config";
import { getCurrentUser, isEditorRole } from "@/lib/supabase/server";
import { StudioNav } from "@/components/studio/StudioNav";

/**
 * Studio (desktop) : panneau latéral 280 px --bg-1, zone de travail --bg-0,
 * densité plus forte. Le middleware filtre sur le rôle ; on revérifie en base.
 */
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentUser();
  if (!current) redirect("/auth/deconnexion?raison=profil");
  if (!isEditorRole(current.profile.role)) redirect("/?erreur=acces-studio");

  const { profile } = current;
  const name = `${profile.first_name} ${profile.last_name}`.trim() || profile.email;

  return (
    <div className="flex min-h-dvh bg-bg-0">
      <aside className="hidden w-[280px] shrink-0 flex-col bg-bg-1 md:flex">
        <div className="flex h-14 items-center gap-2 px-6">
          <Logo height={20} />
          <span className="text-[13px] text-text-3">Studio</span>
        </div>
        <StudioNav />
        <div className="mt-auto px-6 py-5">
          <p className="truncate text-[15px] font-medium text-text-1">{name}</p>
          <p className="text-[13px] text-text-3">{ROLE_LABELS[profile.role]}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between bg-bg-1 px-5 md:hidden">
          <Logo height={20} />
          <StudioNav compact />
        </header>
        <main className="flex-1 px-5 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
