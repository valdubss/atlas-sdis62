import { redirect } from "next/navigation";

/** Traitement des images (sharp) et envois : au-delà des 10 s par défaut. */
export const maxDuration = 60;
import { Logo } from "@/components/brand/Logo";
import { ROLE_LABELS } from "@/lib/config";
import { getCurrentUser, isEditorRole } from "@/lib/supabase/server";
import { StudioNav } from "@/components/studio/StudioNav";
import { UploadQueue } from "@/components/studio/UploadQueue";
import { countPendingProposals } from "@/lib/centres/queries";
import { BottomNav } from "@/components/layout/BottomNav";
import { RoleProvider } from "@/components/layout/RoleContext";

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
  const pendingCenters = await countPendingProposals().catch(() => 0);

  return (
    <RoleProvider canEdit>
    <div className="flex min-h-dvh bg-bg-0">
      <aside className="hidden w-[280px] shrink-0 flex-col bg-bg-1 md:flex">
        <div className="flex h-14 items-center gap-2 px-6">
          <Logo height={24} />
          <span className="text-[13px] text-text-3">Studio</span>
        </div>
        <StudioNav pendingCenters={pendingCenters} />
        <div className="mt-auto px-6 py-5">
          <p className="truncate text-[15px] font-medium text-text-1">{name}</p>
          <p className="text-[13px] text-text-3">{ROLE_LABELS[profile.role]}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="glass fixed inset-x-0 top-0 z-30 md:hidden"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <div className="flex h-12 items-center justify-between px-5">
            <Logo height={22} />
            <StudioNav compact pendingCenters={pendingCenters} />
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-x-clip px-5 pb-28 pt-[calc(48px+env(safe-area-inset-top)+16px)] md:px-8 md:py-8">{children}</main>
        <UploadQueue />
        <div className="md:hidden">
          <BottomNav />
        </div>
      </div>
    </div>
    </RoleProvider>
  );
}
