import type { Metadata } from "next";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { AuditJournal, type AuditFacets, type IncidentRow } from "@/components/studio/AuditJournal";
import { fetchAudit } from "./actions";

export const metadata: Metadata = { title: "Journal" };
export const dynamic = "force-dynamic";

/** Studio → Journal : actions des éditeurs (filtres, pagination, export CSV) et incidents. */
export default async function JournalPage({ searchParams }: { searchParams: Promise<{ acteur?: string; action?: string; type?: string; du?: string; au?: string }> }) {
  const sp = await searchParams;
  const current = await getCurrentUser();
  const supabase = await createClient();
  const filters = { actor: sp.acteur ?? null, action: sp.action ?? null, entity: sp.type ?? null, from: sp.du ?? null, to: sp.au ?? null };
  const [entries, { data: facets }, { data: incidents }] = await Promise.all([
    fetchAudit(filters),
    supabase.rpc("studio_audit_facets"),
    supabase.from("incidents").select("id, title, service, started_at, resolved_at, note").order("started_at", { ascending: false }).limit(30),
  ]);
  return (
    <AuditJournal
      initial={entries}
      filters={filters}
      facets={(facets ?? { actors: [], entities: [] }) as unknown as AuditFacets}
      incidents={(incidents ?? []) as IncidentRow[]}
      isAdmin={current?.profile.role === "admin"}
    />
  );
}
