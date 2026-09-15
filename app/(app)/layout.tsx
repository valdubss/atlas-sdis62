import { redirect } from "next/navigation";
import { BottomNav } from "@/components/layout/BottomNav";
import { createClient, getCurrentUser, isEditorRole } from "@/lib/supabase/server";
import { RoleProvider } from "@/components/layout/RoleContext";
import { ThemeApplier, type Theme } from "@/components/layout/ThemeApplier";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentUser();
  if (!current) redirect("/auth/deconnexion?raison=profil");
  const canEdit = isEditorRole(current.profile.role);
  // Messagerie : éditeurs, référents et invités d'un groupe actif (RPC), non-lus pour la pastille
  const supabase = await createClient();
  const canMessage = canEdit || Boolean((await supabase.rpc("can_use_messaging")).data);
  const messagesUnread = canMessage ? ((await supabase.rpc("messaging_unread_total")).data ?? 0) : 0;
  const theme = ((await supabase.from("user_settings").select("theme").eq("user_id", current.profile.id).maybeSingle()).data?.theme ?? "system") as Theme;

  return (
    <RoleProvider canEdit={canEdit} canMessage={canMessage} messagesUnread={messagesUnread}>
      <ThemeApplier theme={theme} />
      <div className="min-h-dvh overflow-x-clip bg-bg-0">
        {/* Marges d'écran 20 px mobile / 32 px desktop ; lecture ≤ 680 px ; place pour la barre haute (48 px) */}
        <main className="mx-auto w-full max-w-[680px] px-3 pb-28 pt-[calc(48px+env(safe-area-inset-top)+8px)] sm:px-8">{children}</main>
        <BottomNav />
      </div>
    </RoleProvider>
  );
}
