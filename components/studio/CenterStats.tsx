import Link from "next/link";
import { formatDateLong } from "@/lib/format";

export type CenterStatsData = {
  referents: number;
  centers_with_referent: number;
  by_month: { month: string; received: number; published: number; declined: number }[];
  silent_centers: { id: string; name: string; last: string | null }[];
  center_page_views: number;
  directory_views: number;
};

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
function monthLabel(m: string) {
  const [y, mm] = m.split("-");
  return `${MONTHS[Number(mm) - 1] ?? mm} ${y}`;
}

/** Studio → Statistiques → Centres : réseau de référents, propositions, centres silencieux, consultations. */
export function CenterStats({ s, days }: { s: CenterStatsData; days: number }) {
  const received = s.by_month.reduce((n, m) => n + m.received, 0);
  const published = s.by_month.reduce((n, m) => n + m.published, 0);
  const declined = s.by_month.reduce((n, m) => n + m.declined, 0);
  return (
    <section className="space-y-4">
      <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">Centres</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Référents actifs", s.referents, `${s.centers_with_referent} centre${s.centers_with_referent > 1 ? "s" : ""} couvert${s.centers_with_referent > 1 ? "s" : ""}`],
          ["Propositions reçues", received, `${published} publiée${published > 1 ? "s" : ""}, ${declined} refusée${declined > 1 ? "s" : ""}`],
          ["Pages de centre vues", s.center_page_views, `agents × jours, ${days} j`],
          ["Annuaire consulté", s.directory_views, `agents × jours, ${days} j`],
        ].map(([label, value, hint]) => (
          <div key={String(label)} className="rounded-[16px] bg-bg-1 px-4 py-4">
            <p className="text-[13px] text-text-2">{label}</p>
            <p className="mt-1 text-[24px] font-semibold tracking-[-0.02em] text-text-1">{value}</p>
            <p className="text-[12px] text-text-3">{hint}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[16px] bg-bg-1 p-5">
          <h3 className="text-[15px] font-semibold text-text-1">Propositions par mois</h3>
          {s.by_month.length === 0 ? (
            <p className="mt-2 text-[13px] text-text-3">Aucune proposition sur la période.</p>
          ) : (
            <table className="mt-3 w-full text-[13px]">
              <thead>
                <tr className="text-left text-text-3">
                  <th className="py-1 font-medium">Mois</th>
                  <th className="py-1 text-right font-medium">Reçues</th>
                  <th className="py-1 text-right font-medium">Publiées</th>
                  <th className="py-1 text-right font-medium">Refusées</th>
                </tr>
              </thead>
              <tbody className="text-text-1">
                {s.by_month.map((m) => (
                  <tr key={m.month} className="border-t border-line">
                    <td className="py-1.5">{monthLabel(m.month)}</td>
                    <td className="py-1.5 text-right tabular-nums">{m.received}</td>
                    <td className="py-1.5 text-right tabular-nums">{m.published}</td>
                    <td className="py-1.5 text-right tabular-nums">{m.declined}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="rounded-[16px] bg-bg-1 p-5">
          <h3 className="text-[15px] font-semibold text-text-1">
            Centres silencieux <span className="text-text-3">{s.silent_centers.length}</span>
          </h3>
          <p className="text-[13px] text-text-3">Aucune actu publiée depuis 60 jours (CIS, CS, CPI).</p>
          {s.silent_centers.length > 0 && (
            <ul className="mt-3 max-h-64 space-y-1.5 overflow-y-auto text-[13px]">
              {s.silent_centers.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3">
                  <Link href={`/studio/centres/referentiel/centre/${c.id}`} className="min-w-0 truncate text-text-1 hover:text-navy-link">
                    {c.name}
                  </Link>
                  <span className="shrink-0 text-text-3">{c.last ? `dernière le ${formatDateLong(c.last)}` : "jamais"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
