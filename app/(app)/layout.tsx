import { redirect } from "next/navigation";
import { BottomNav } from "@/components/layout/BottomNav";
import { getCurrentUser, isEditorRole } from "@/lib/supabase/server";
import { RoleProvider } from "@/components/layout/RoleContext";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentUser();
  if (!current) redirect("/auth/deconnexion?raison=profil");

  return (
    <RoleProvider canEdit={isEditorRole(current.profile.role)}>
      <div className="min-h-dvh bg-bg-0">
        {/* Marges d'écran 20 px mobile / 32 px desktop ; lecture ≤ 680 px ; place pour la barre haute (48 px) */}
        <main className="mx-auto w-full max-w-[680px] overflow-x-clip px-5 pb-28 pt-[calc(48px+env(safe-area-inset-top)+8px)] sm:px-8">{children}</main>
        <BottomNav />
      </div>
    </RoleProvider>
  );
}
