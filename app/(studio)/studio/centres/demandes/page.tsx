import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { CenterRequest } from "@/lib/membership/request";
import { MembershipRequests } from "@/components/centre/MembershipRequests";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateLong } from "@/lib/format";

export const metadata: Metadata = { title: "Demandes de rattachement" };
export const dynamic = "force-dynamic";

type Row = CenterRequest & { status: string; decided_at: string | null; decided_via: string | null; note: string | null; recipient_email: string | null; center: { name: string } | null; service: { name: string } | null };

/** Toutes les demandes de rattachement (service communication) : en attente, puis les dernières décisions. */
export default async function MembershipRequestsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("membership_requests")
    .select("id, status, requested_at, expires_at, decided_at, decided_via, note, recipient_email, profile:profiles!membership_requests_profile_id_fkey(id, first_name, last_name, email, avatar_key, job_title), center:centers!membership_requests_center_id_fkey(name), service:services!membership_requests_service_id_fkey(name)")
    .order("requested_at", { ascending: false })
    .limit(200);
  const rows = (data ?? []) as unknown as Row[];
  const pending = rows.filter((r) => r.status === "pending").map((r) => ({ ...r, target: r.center?.name ?? r.service?.name ?? null }));
  const done = rows.filter((r) => r.status !== "pending").slice(0, 50);
  const STATUS: Record<string, string> = { accepted: "acceptée", declined: "refusée", cancelled: "retirée", expired: "expirée" };

  return (
    <div className="mx-auto max-w-[960px] space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text-1">Demandes de rattachement</h1>
          <p className="text-[13px] text-text-3">Chaque demande est envoyée par e-mail au chef de centre (ou au responsable com, ou au service communication). Vous pouvez aussi décider ici.</p>
        </div>
        <Link href="/studio/centres" className="pressable text-[15px] font-medium text-text-2 hover:text-text-1">
          Centres
        </Link>
      </div>
      {pending.length === 0 ? (
        <div className="rounded-[16px] bg-bg-1">
          <EmptyState title="Aucune demande en attente" description="Les agents qui choisissent un centre ou un service apparaîtront ici jusqu'à la décision." />
        </div>
      ) : (
        <MembershipRequests requests={pending} title="En attente" />
      )}
      {done.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-[17px] font-semibold tracking-[-0.02em] text-text-1">Dernières décisions</h2>
          <ul className="hairline rounded-[16px] bg-bg-1">
            {done.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-5 py-3 text-[13px]">
                <span className="min-w-0 flex-1 truncate text-text-1">
                  {r.profile ? `${r.profile.first_name} ${r.profile.last_name}`.trim() || r.profile.email : "Agent"} → {r.center?.name ?? r.service?.name ?? "—"}
                </span>
                <span className="text-text-3">
                  {STATUS[r.status] ?? r.status}
                  {r.decided_at ? ` le ${formatDateLong(r.decided_at)}` : ""}
                  {r.decided_via === "email" ? " (par e-mail)" : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
