import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { fetchDirectoryData } from "@/lib/centres/directory";
import { PageHeader } from "@/components/layout/PageHeader";
import { DirectoryView } from "@/components/annuaire/DirectoryView";

export const metadata: Metadata = { title: "Annuaire" };
export const dynamic = "force-dynamic";

/** Annuaire : centres par groupement, services de direction, agents visibles (opt-in), carte. */
export default async function AnnuairePage() {
  const current = await getCurrentUser();
  if (!current) redirect("/auth/deconnexion?raison=profil");
  const data = await fetchDirectoryData();
  const supabase = await createClient();
  void supabase.rpc("record_page_view", { p_kind: "directory" }).then(() => undefined, () => undefined);
  return (
    <div className="space-y-3">
      <PageHeader title="Annuaire" />
      <DirectoryView data={data} homeCenterId={current.profile.center_id} />
    </div>
  );
}
