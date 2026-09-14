import { redirect } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { BottomNav } from "@/components/layout/BottomNav";
import { getCurrentUser, isEditorRole } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const current = await getCurrentUser();
  if (!current) redirect("/login");

  return (
    <div className="min-h-dvh bg-bg">
      <TopBar showStudio={isEditorRole(current.profile.role)} />
      <main className="mx-auto w-full max-w-2xl px-4 pb-24 pt-4">{children}</main>
      <BottomNav />
    </div>
  );
}
