import type { Metadata } from "next";
import { fetchDirectory } from "@/lib/centres/public";
import { PageHeader } from "@/components/layout/PageHeader";
import { CenterPicker } from "@/components/centre/CenterPicker";

export const metadata: Metadata = { title: "Annuaire" };
export const dynamic = "force-dynamic";

/** Annuaire (première version) : centres par groupement et services de direction. La carte et les agents arrivent au lot C. */
export default async function AnnuairePage() {
  const directory = await fetchDirectory();
  return (
    <div className="space-y-3">
      <PageHeader title="Annuaire" />
      <CenterPicker directory={directory} mode="browse" />
    </div>
  );
}
