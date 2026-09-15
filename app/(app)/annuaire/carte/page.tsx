import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { fetchDirectoryData } from "@/lib/centres/directory";
import { BackBar } from "@/components/layout/BackBar";
import { DirectoryMap } from "@/components/annuaire/DirectoryMap";

export const metadata: Metadata = { title: "Carte des centres" };
export const dynamic = "force-dynamic";

export default async function CartePage() {
  const current = await getCurrentUser();
  if (!current) redirect("/auth/deconnexion?raison=profil");
  const data = await fetchDirectoryData();
  return (
    <div className="space-y-3">
      <BackBar title="Carte des centres" href="/annuaire" />
      <DirectoryMap centers={data.centers} homeCenterId={current.profile.center_id} />
      <p className="px-1 text-[12px] text-text-4">Fond de carte OpenFreeMap (OpenStreetMap), sans clé ni traçage. Votre position n&apos;est demandée qu&apos;au toucher de « Autour de moi » et n&apos;est jamais enregistrée.</p>
    </div>
  );
}
