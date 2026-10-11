import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchCenterById, fetchGroupings } from "@/lib/centres/queries";
import { CenterForm } from "@/components/studio/CenterForm";

export const metadata: Metadata = { title: "Centre" };
export const dynamic = "force-dynamic";

export default async function CenterPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string }> }) {
  const [{ id }, { ok }] = await Promise.all([params, searchParams]);
  const groupings = await fetchGroupings();
  if (id === "new") return <CenterForm center={null} groupings={groupings} />;
  const center = await fetchCenterById(id);
  if (!center) notFound();
  return <CenterForm center={center} groupings={groupings} notice={ok ? "Centre créé. Désignez ses référents ci-contre." : null} />;
}
