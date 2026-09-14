import type { Metadata } from "next";
import { fetchAgenda } from "@/lib/agenda/queries";
import { AgendaList } from "@/components/agenda/AgendaList";
import { PageHeader } from "@/components/layout/PageHeader";

export const metadata: Metadata = { title: "Agenda" };
export const dynamic = "force-dynamic";

export default async function AgendaPage() {
  const { upcoming, past } = await fetchAgenda();
  return (
    <div className="space-y-3">
      <PageHeader title="Agenda" />
      <AgendaList upcoming={upcoming} past={past} />
    </div>
  );
}
