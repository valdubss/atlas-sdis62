export type NotificationStatsData = {
  by_center: { center: string; agents: number; subscribed: number }[];
  unattached: { agents: number; subscribed: number };
  by_kind: { kind: string; pushes: number; sent: number; opens: number }[];
  deferred_pending: number;
};

const KIND: Record<string, string> = { push_category: "Publications", push_pinned: "Épinglées", push_flash: "Flashs", push_center: "Mon centre" };

/** Studio → Statistiques → Notifications : activation par centre, ouverture par type de contenu. */
export function NotificationStats({ s }: { s: NotificationStatsData }) {
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : "—");
  const totalAgents = s.by_center.reduce((n, c) => n + c.agents, 0) + s.unattached.agents;
  const totalSub = s.by_center.reduce((n, c) => n + c.subscribed, 0) + s.unattached.subscribed;
  return (
    <section className="space-y-4">
      <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">Notifications</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[16px] bg-bg-1 p-5">
          <h3 className="text-[15px] font-semibold text-text-1">
            Pushs activées par centre <span className="text-text-3">{pct(totalSub, totalAgents)}</span>
          </h3>
          <p className="text-[13px] text-text-3">Agents ayant activé les notifications sur au moins un appareil.</p>
          <ul className="mt-3 max-h-72 space-y-1.5 overflow-y-auto text-[13px]">
            {s.by_center.map((c) => (
              <li key={c.center} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-text-1">{c.center}</span>
                <span className="h-1.5 w-24 overflow-hidden rounded-full bg-bg-2">
                  <span className="block h-full bg-navy-link" style={{ width: pct(c.subscribed, c.agents) === "—" ? 0 : pct(c.subscribed, c.agents) }} />
                </span>
                <span className="w-24 text-right tabular-nums text-text-2">
                  {c.subscribed}/{c.agents} · {pct(c.subscribed, c.agents)}
                </span>
              </li>
            ))}
            {s.unattached.agents > 0 && (
              <li className="flex items-center gap-3 text-text-3">
                <span className="min-w-0 flex-1 truncate">Sans rattachement</span>
                <span className="w-24 text-right tabular-nums">
                  {s.unattached.subscribed}/{s.unattached.agents}
                </span>
              </li>
            )}
          </ul>
        </div>
        <div className="rounded-[16px] bg-bg-1 p-5">
          <h3 className="text-[15px] font-semibold text-text-1">Ouverture par type de contenu</h3>
          <p className="text-[13px] text-text-3">Clics sur la notification rapportés aux envois de la période. {s.deferred_pending > 0 && `${s.deferred_pending} push en attente de fin de plage de silence.`}</p>
          {s.by_kind.length === 0 ? (
            <p className="mt-3 text-[13px] text-text-3">Aucune push envoyée sur la période.</p>
          ) : (
            <table className="mt-3 w-full text-[13px]">
              <thead>
                <tr className="text-left text-text-3">
                  <th className="py-1 font-medium">Type</th>
                  <th className="py-1 text-right font-medium">Pushs</th>
                  <th className="py-1 text-right font-medium">Envois</th>
                  <th className="py-1 text-right font-medium">Ouvertures</th>
                  <th className="py-1 text-right font-medium">Taux</th>
                </tr>
              </thead>
              <tbody className="text-text-1">
                {s.by_kind.map((k) => (
                  <tr key={k.kind} className="border-t border-line">
                    <td className="py-1.5">{KIND[k.kind] ?? k.kind}</td>
                    <td className="py-1.5 text-right tabular-nums">{k.pushes}</td>
                    <td className="py-1.5 text-right tabular-nums">{k.sent}</td>
                    <td className="py-1.5 text-right tabular-nums">{k.opens}</td>
                    <td className="py-1.5 text-right tabular-nums">{pct(k.opens, k.sent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}
