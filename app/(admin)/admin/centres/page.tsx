import type { Metadata } from "next";
import { fetchCentersStudio, fetchGroupings, fetchServicesStudio } from "@/lib/centres/queries";
import { ReferentielPanel } from "@/components/studio/ReferentielPanel";

export const metadata: Metadata = { title: "Référentiel des centres" };
export const dynamic = "force-dynamic";

export default async function ReferentielPage() {
  const [groupings, centers, services] = await Promise.all([fetchGroupings(), fetchCentersStudio(), fetchServicesStudio()]);
  return <ReferentielPanel groupings={groupings} centers={centers} services={services} />;
}
