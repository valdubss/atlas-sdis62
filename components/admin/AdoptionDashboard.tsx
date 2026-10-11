import Link from "next/link";
import type { AdoptionStats } from "@/lib/admin/stats";
import { formatDateLong } from "@/lib/format";

function Kpi({ label, value, hint, href }: { label: string; value: number | string; hint?: string; href?: string }) {
  const body = (
    <>
      <p className="text-[13px] text-text-3">{label}</p>
      <p className="mt-1 text-[28px] font-semibold tracking-[-0.02em] text-text-1 tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-[12px] text-text-3">{hint}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="pressable block rounded-[16px] bg-bg-1 px-4 py-3 hover:bg-bg-2">
      {body}
    </Link>
  ) : (
    <div className="rounded-[16px] bg-bg-1 px-4 py-3">{body}</div>
  );
}

function weekLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

/** Tableau de bord d'adoption : comptes, inscriptions et activité par semaine, centres à compléter, demandes, contenu. */
export function AdoptionDashboard({ stats }: { stats: AdoptionStats }) {
  const a = stats.accounts;
  const max = Math.max(1, ...stats.weekly.map((w) => Math.max(w.signups, w.active)));
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
  return (
    <div className="mx-auto max-w-[1100px] space-y-8">
      <div>
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text-1">Tableau de bord</h1>
        <p className="text-[13px] text-text-3">Adoption d&apos;ATLAS par les agents · {formatDateLong(stats.generated_at)}</p>
      </div>

      <section className="space-y-3">
        <h2 className="px-1 text-[17px] font-semibold tracking-[-0.02em] text-text-1">Comptes</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Comptes actifs" value={a.active} hint={`${a.admins} admin, ${a.editors} éditeurs, ${a.readers} agents`} href="/admin/utilisateurs" />
          <Kpi label="Nouveaux (7 j / 30 j)" value={`${a.new_7d} / ${a.new_30d}`} />
          <Kpi label="Vus ces 7 jours" value={a.seen_7d} hint={`${pct(a.seen_7d, a.active)} % des comptes actifs · ${a.seen_30d} sur 30 j`} />
          <Kpi label="Jamais connectés" value={a.never_signed_in} hint="Compte créé, aucune connexion" href="/admin/utilisateurs?filtre=never" />
          <Kpi label="Rattachés à un centre" value={a.attached} hint={`${a.unattached} sans rattachement`} />
          <Kpi label="Mot de passe défini" value={a.with_password} hint={`${pct(a.with_password, a.active)} % des comptes actifs`} />
          <Kpi label="Appareils avec notifications" value={stats.content.push_devices} />
          <Kpi label="Demandes en attente" value={stats.requests.pending} hint={`${stats.requests.accepted_30d} acceptées, ${stats.requests.declined_30d} refusées sur 30 j`} href="/admin/centres/demandes" />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="px-1 text-[17px] font-semibold tracking-[-0.02em] text-text-1">Douze dernières semaines</h2>
        <div className="rounded-[16px] bg-bg-1 px-4 py-4">
          <div className="flex items-end gap-1.5" style={{ height: 140 }} role="img" aria-label="Inscriptions et agents actifs par semaine">
            {stats.weekly.map((w) => (
              <div key={w.week} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`Semaine du ${weekLabel(w.week)} : ${w.signups} inscription(s), ${w.active} actif(s)`}>
                <div className="flex w-full items-end justify-center gap-0.5" style={{ height: 112 }}>
                  <div className="w-1/2 max-w-[14px] rounded-t-[3px] bg-red-fill" style={{ height: `${Math.round((w.signups / max) * 100)}%` }} />
                  <div className="w-1/2 max-w-[14px] rounded-t-[3px] bg-text-3/50" style={{ height: `${Math.round((w.active / max) * 100)}%` }} />
                </div>
                <span className="text-[10px] text-text-3">{weekLabel(w.week)}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 flex gap-4 text-[12px] text-text-3">
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-red-fill" /> Inscriptions</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-text-3/50" /> Agents connectés</span>
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="px-1 text-[17px] font-semibold tracking-[-0.02em] text-text-1">Centres</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Centres actifs" value={stats.centers.total} href="/admin/centres" />
          <Kpi label="Sans chef ni responsable com" value={stats.centers.without_contact} hint="Adresses à saisir sur la page du centre" />
          <Kpi label="Sans aucun membre" value={stats.centers.without_members} />
          <Kpi label="Avec des notes de service" value={stats.centers.with_notes} />
        </div>
        {stats.centers.list_without_contact.length > 0 && (
          <div className="hairline rounded-[16px] bg-bg-1">
            <p className="px-5 pt-3 text-[13px] text-text-3">Centres sans adresse de chef ni de responsable com : tant qu&apos;elle n&apos;est pas saisie, personne n&apos;y publie de note de service et les demandes de rattachement arrivent au service communication.</p>
            <ul className="divide-y divide-line/60">
              {stats.centers.list_without_contact.map((c) => (
                <li key={c.id}>
                  <Link href={`/centre/${c.slug}`} className="pressable flex min-h-12 items-center justify-between gap-3 px-5 py-2 text-[15px] text-text-1">
                    <span className="truncate">{c.name}</span>
                    <span className="shrink-0 text-[13px] text-text-3">{c.members} membre{c.members > 1 ? "s" : ""}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="px-1 text-[17px] font-semibold tracking-[-0.02em] text-text-1">Contenu</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Publications (30 j)" value={stats.content.posts_30d} />
          <Kpi label="Notes de service (30 j)" value={stats.content.notes_30d} />
          <Kpi label="Messages (7 j)" value={stats.content.messages_7d} />
          <Kpi label="Commentaires (30 j)" value={stats.content.comments_30d} />
        </div>
      </section>
    </div>
  );
}
