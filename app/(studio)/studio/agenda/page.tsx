import type { Metadata } from "next";
import Link from "next/link";
import { fetchEventsStudio } from "@/lib/agenda/queries";
import { eventShortTime, eventDayNumber, eventWeekday, eventMonthYear, isPast } from "@/lib/agenda/format";
import { NewButton } from "@/components/studio/NewButton";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Agenda" };
export const dynamic = "force-dynamic";

const NOTICES: Record<string, string> = {
  published: "Événement enregistré. Il est visible dans l'agenda des agents.",
  draft: "Brouillon enregistré.",
  supprime: "Événement supprimé.",
};

export default async function StudioAgendaPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const { ok } = await searchParams;
  const events = await fetchEventsStudio();
  const now = Date.now();
  const upcoming = events.filter((e) => !isPast(e, now)).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = events.filter((e) => isPast(e, now));

  const Section = ({ title, items, dim }: { title: string; items: typeof events; dim?: boolean }) => (
    <section className="space-y-3">
      <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">
        {title} <span className="text-text-3">{items.length}</span>
      </h2>
      <div className={cn("hairline rounded-[16px] bg-bg-1", dim && "opacity-70")}>
        {items.length === 0 ? (
          <p className="px-5 py-6 text-[15px] text-text-2">{dim ? "Aucun événement passé." : "Aucun événement prévu. Ajoutez le prochain avec le bouton +."}</p>
        ) : (
          items.map((e) => (
            <Link key={e.id} href={`/studio/agenda/${e.id}`} className="pressable flex items-center gap-4 px-5 py-3">
              <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-[10px] bg-bg-2 leading-none text-text-1" aria-hidden="true">
                <span className="text-[9px] font-medium uppercase tracking-[0.08em] text-text-3">{eventWeekday(e.starts_at)}</span>
                <span className="mt-0.5 text-[17px] font-semibold tabular-nums">{eventDayNumber(e.starts_at)}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] text-text-1">{e.title}</span>
                <span className="block truncate text-[13px] text-text-3">
                  {eventMonthYear(e.starts_at)} · {eventShortTime(e)}
                  {e.location && ` · ${e.location}`}
                </span>
              </span>
              <Badge tone={e.status === "published" ? "success" : "neutral"}>{e.status === "published" ? "Visible" : "Brouillon"}</Badge>
            </Link>
          ))
        )}
      </div>
    </section>
  );

  return (
    <div className="mx-auto max-w-[960px] space-y-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text-1">Agenda</h1>
        <NewButton href="/studio/agenda/new" label="Nouvel événement" />
      </div>
      {ok && NOTICES[ok] && (
        <p role="status" className="text-[15px] text-text-2">
          {NOTICES[ok]}
        </p>
      )}
      <Section title="À venir" items={upcoming} />
      <Section title="Passés" items={past} dim />
    </div>
  );
}
