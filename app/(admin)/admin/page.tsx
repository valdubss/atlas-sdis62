import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { fetchAdoptionStats } from "@/lib/admin/stats";
import { AdoptionDashboard } from "@/components/admin/AdoptionDashboard";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Administration" };
export const dynamic = "force-dynamic";

/** Administration → Tableau de bord d'adoption (administrateurs ; les éditeurs arrivent sur les centres). */
export default async function AdminHomePage() {
  const current = await getCurrentUser();
  if (!current) redirect("/auth/deconnexion?raison=profil");
  if (current.profile.role !== "admin") redirect("/admin/centres");
  const stats = await fetchAdoptionStats();
  if (!stats) {
    return (
      <div className="mx-auto max-w-[960px]">
        <div className="rounded-[16px] bg-bg-1">
          <EmptyState title="Chiffres indisponibles" description="La fonction admin_adoption_stats n'a pas répondu. Vérifiez que la migration 0039 est appliquée." />
        </div>
      </div>
    );
  }
  return <AdoptionDashboard stats={stats} />;
}
