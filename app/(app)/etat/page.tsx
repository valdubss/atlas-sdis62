import type { Metadata } from "next";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { BackBar } from "@/components/layout/BackBar";
import { LargeTitle } from "@/components/layout/TopBar";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Health } from "@/app/api/health/route";

export const metadata: Metadata = { title: "État des services" };
export const dynamic = "force-dynamic";

const SERVICE_LABELS: Record<string, string> = { app: "Application", db: "Base de données", storage: "Stockage", video: "Vidéo", notifications: "Notifications", messaging: "Messagerie" };
const STATUS: Record<string, { label: string; dot: string }> = {
  ok: { label: "Fonctionne", dot: "bg-success" },
  degraded: { label: "Dégradé", dot: "bg-[#e0a72e]" },
  down: { label: "Indisponible", dot: "bg-red" },
};

/** /etat : état des services (vérifié à l'ouverture) et incidents des 90 derniers jours. */
export default async function StatusPage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const health = await fetch(`${proto}://${host}/api/health`, { cache: "no-store" })
    .then((r) => r.json() as Promise<Health>)
    .catch(() => null);
  const supabase = await createClient();
  const { data: incidents } = await supabase
    .from("incidents")
    .select("id, title, service, started_at, resolved_at, note")
    .gte("started_at", new Date(Date.now() - 90 * 86_400_000).toISOString())
    .order("started_at", { ascending: false })
    .limit(50);
  const open = (incidents ?? []).filter((i) => !i.resolved_at);

  return (
    <div className="space-y-4">
      <BackBar title="État des services" href="/profil" />
      <LargeTitle>État des services</LargeTitle>
      <section className="hairline overflow-hidden rounded-[16px] bg-bg-1">
        {health ? (
          health.services.map((s) => (
            <div key={s.key} className="flex items-center gap-3 px-5 py-3">
              <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", STATUS[s.status]?.dot)} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] text-text-1">{s.label}</span>
                <span className="block truncate text-[13px] text-text-3">{s.detail}</span>
              </span>
              <span className="text-[13px] font-medium text-text-2">{STATUS[s.status]?.label ?? s.status}</span>
            </div>
          ))
        ) : (
          <p className="px-5 py-6 text-center text-[15px] text-text-2">Vérification impossible pour le moment.</p>
        )}
      </section>
      <p className="px-1 text-[12px] text-text-4">
        {health ? `Vérifié le ${formatDateTime(health.checked_at)} · version ${health.version}` : ""}
      </p>
      <section className="space-y-2">
        <h2 className="px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-text-3">
          Incidents des 90 derniers jours {open.length > 0 && <span className="text-red-text">· {open.length} en cours</span>}
        </h2>
        <ul className="hairline overflow-hidden rounded-[16px] bg-bg-1">
          {(incidents ?? []).length === 0 && <li className="px-5 py-6 text-center text-[15px] text-text-2">Aucun incident déclaré.</li>}
          {(incidents ?? []).map((i) => (
            <li key={i.id} className="px-5 py-3">
              <p className="flex items-center gap-2 text-[15px] text-text-1">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", i.resolved_at ? "bg-success" : "bg-red")} aria-hidden="true" />
                {i.title}
              </p>
              <p className="text-[13px] text-text-3">
                {SERVICE_LABELS[i.service] ?? i.service} · du {formatDateTime(i.started_at)} {i.resolved_at ? `au ${formatDateTime(i.resolved_at)}` : "· en cours"}
              </p>
              {i.note && <p className="mt-1 whitespace-pre-line text-[13px] text-text-2">{i.note}</p>}
            </li>
          ))}
        </ul>
      </section>
      <p className="px-1 text-[12px] text-text-4">En cas de panne, le fil reste consultable hors ligne (dernières publications) et vos réactions ou messages partent dès le retour du réseau.</p>
    </div>
  );
}
