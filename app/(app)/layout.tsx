import { redirect } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { BottomNav } from "@/components/layout/BottomNav";
import { getCurrentUser, isEditorRole } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentUser();
  // Session sans profil valide : on ferme la session (sinon /login renvoie vers /).
  if (!current) redirect("/auth/deconnexion?raison=profil");

  return (
    <div className="min-h-dvh bg-bg">
      <TopBar showStudio={isEditorRole(current.profile.role)} />
      {/* Mobile : contenu bord à bord (les pages gèrent leur marge) ; desktop : colonne centrée */}
      <main className="mx-auto w-full max-w-lg pb-24 pt-3 sm:px-4 sm:pt-5">{children}</main>
      <BottomNav />
    </div>
  );
}
