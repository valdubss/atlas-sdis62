import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { fetchMyProposals } from "@/lib/centres/public";
import { BackBar } from "@/components/layout/BackBar";
import { MyProposals } from "@/components/centre/MyProposals";

export const metadata: Metadata = { title: "Mes propositions" };
export const dynamic = "force-dynamic";

export default async function ProposalsPage() {
  const current = await getCurrentUser();
  if (!current) redirect("/auth/deconnexion?raison=profil");
  const items = await fetchMyProposals(current.profile.id);
  return (
    <div className="space-y-3">
      <BackBar title="Mes propositions" href="/profil" />
      <p className="px-1 text-[13px] text-text-3">Chaque proposition est relue par le service communication avant publication sur la page du centre.</p>
      <MyProposals items={items} />
    </div>
  );
}
