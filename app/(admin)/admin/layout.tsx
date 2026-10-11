import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/Logo";
import { ROLE_LABELS } from "@/lib/config";
import { createClient, getCurrentUser, isEditorRole } from "@/lib/supabase/server";
import { AdminNav } from "@/components/admin/AdminNav";
import { BottomNav } from "@/components/layout/BottomNav";
import { RoleProvider } from "@/components/layout/RoleContext";
import { ThemeApplier } from "@/components/layout/ThemeApplier";

export const maxDuration = 60;

/**
 * Espace d'administration, distinct du Studio (contenus) : comptes, centres et
 * services, rattachements, journal, paramètres. Panneau latéral 240 px sur
 * ordinateur ; barre haute avec sélecteur et barre basse sur téléphone.
 * Service communication (éditeurs) pour les centres, le journal et les
 * paramètres ; administrateurs seuls pour le tableau de bord et les comptes.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentUser();
  if (!current) redirect("/auth/deconnexion?raison=profil");
  const { profile } = current;
  if (!isEditorRole(profile.role)) redirect("/?erreur=acces-studio");
  const isAdmin = profile.role === "admin";
  const supabase = await createClient();
  const [{ count: pendingRequests }, unreadRpc] = await Promise.all([
    supabase.from("membership_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.rpc("messaging_unread_total"),
  ]);
  const name = `${profile.first_name} ${profile.last_name}`.trim() || profile.email;

  return (
    <RoleProvider canEdit isAdmin={isAdmin} canMessage messagesUnread={(unreadRpc.data as number | null) ?? 0}>
      <ThemeApplier theme="system" />
      <div className="flex min-h-dvh bg-bg-0">
        <aside className="hidden w-[240px] shrink-0 flex-col bg-bg-1 md:flex">
          <div className="flex h-14 items-center gap-2 px-6">
            <Logo height={24} />
            <span className="text-[13px] text-text-3">Administration</span>
          </div>
          <AdminNav isAdmin={isAdmin} pendingRequests={pendingRequests ?? 0} />
          <div className="mt-auto px-6 py-5">
            <p className="truncate text-[15px] font-medium text-text-1">{name}</p>
            <p className="text-[13px] text-text-3">{ROLE_LABELS[profile.role]}</p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="glass fixed inset-x-0 top-0 z-30 md:hidden" style={{ paddingTop: "env(safe-area-inset-top)" }}>
            <div className="flex h-12 items-center justify-between px-5">
              <span className="flex items-center gap-2">
                <Logo height={22} />
                <span className="text-[13px] text-text-3">Admin</span>
              </span>
              <AdminNav compact isAdmin={isAdmin} pendingRequests={pendingRequests ?? 0} />
            </div>
          </header>
          <main className="min-w-0 flex-1 overflow-x-clip px-4 pb-28 pt-[calc(48px+env(safe-area-inset-top)+16px)] md:px-8 md:py-8">{children}</main>
          <div className="md:hidden">
            <BottomNav />
          </div>
        </div>
      </div>
    </RoleProvider>
  );
}
