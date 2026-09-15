import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchGroupings, fetchServiceById } from "@/lib/centres/queries";
import { ServiceForm } from "@/components/studio/ServiceForm";

export const metadata: Metadata = { title: "Service" };
export const dynamic = "force-dynamic";

export default async function ServicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string }> }) {
  const [{ id }, { ok }] = await Promise.all([params, searchParams]);
  const groupings = await fetchGroupings();
  if (id === "new") return <ServiceForm service={null} groupings={groupings} />;
  const service = await fetchServiceById(id);
  if (!service) notFound();
  return <ServiceForm service={service} groupings={groupings} notice={ok ? "Service créé." : null} />;
}
