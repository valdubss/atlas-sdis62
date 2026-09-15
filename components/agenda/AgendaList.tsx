"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarPlus, MapPin } from "lucide-react";
import type { EventItem } from "@/lib/agenda/queries";
import { eventDayKey, eventDayNumber, eventMonthYear, eventShortTime, eventWeekday, eventWhen, isToday } from "@/lib/agenda/format";
import { Sheet } from "@/components/ui/Sheet";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";

/**
 * Agenda des agents : événements à venir regroupés par mois, pastille de jour
 * à gauche (façon calendrier iOS), feuille de détail au tap avec ajout au
 * calendrier du téléphone (.ics). Les événements passés se déplient en bas.
 */
export function AgendaList({ upcoming, past }: { upcoming: EventItem[]; past: EventItem[] }) {
  const [open, setOpen] = useState<EventItem | null>(null);
  const [showPast, setShowPast] = useState(false);

  if (upcoming.length === 0 && past.length === 0) {
    return <EmptyState title="Rien de prévu pour le moment" description="Les événements du service apparaîtront ici." />;
  }

  return (
    <div className="space-y-6">
      {upcoming.length === 0 ? (
        <EmptyState title="Rien de prévu prochainement" description="Les prochains événements du service apparaîtront ici." />
      ) : (
        groupByMonth(upcoming).map(([month, items]) => (
          <section key={month} className="space-y-2">
            <h2 className="px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-text-3">{month}</h2>
            <ul className="hairline overflow-hidden rounded-[16px] bg-bg-1">
              {items.map((e) => (
                <EventRow key={e.id} event={e} onOpen={() => setOpen(e)} />
              ))}
            </ul>
          </section>
        ))
      )}

      {past.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowPast((v) => !v)}
            aria-expanded={showPast}
            className="pressable px-1 text-[15px] font-medium text-text-2 hover:text-text-1"
          >
            {showPast ? "Masquer les événements passés" : `Événements passés (${past.length})`}
          </button>
          {showPast &&
            groupByMonth(past).map(([month, items]) => (
              <section key={month} className="space-y-2 pt-2">
                <h2 className="px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-text-3">{month}</h2>
                <ul className="hairline overflow-hidden rounded-[16px] bg-bg-1 opacity-70">
                  {items.map((e) => (
                    <EventRow key={e.id} event={e} onOpen={() => setOpen(e)} />
                  ))}
                </ul>
              </section>
            ))}
        </div>
      )}

      <Sheet open={open !== null} onClose={() => setOpen(null)} title={open?.title ?? "Événement"}>
        {open && <EventDetail event={open} />}
      </Sheet>
    </div>
  );
}

function groupByMonth(items: EventItem[]): [string, EventItem[]][] {
  const map = new Map<string, EventItem[]>();
  for (const e of items) {
    const key = eventMonthYear(e.starts_at);
    map.set(key, [...(map.get(key) ?? []), e]);
  }
  return [...map.entries()];
}

function EventRow({ event: e, onOpen }: { event: EventItem; onOpen: () => void }) {
  const today = isToday(e);
  return (
    <li>
      <button type="button" onClick={onOpen} className="pressable flex w-full items-center gap-4 px-4 py-3 text-left">
        <span
          className={cn(
            "flex h-[52px] w-[52px] shrink-0 flex-col items-center justify-center rounded-[12px] leading-none",
            today ? "bg-red-fill text-white" : "bg-bg-2 text-text-1",
          )}
          aria-hidden="true"
        >
          <span className="text-[10px] font-medium uppercase tracking-[0.08em] opacity-80">{eventWeekday(e.starts_at)}</span>
          <span className="mt-0.5 text-[22px] font-semibold tabular-nums">{eventDayNumber(e.starts_at)}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium text-text-1">{e.title}</span>
          <span className="block truncate text-[13px] text-text-3">
            {eventShortTime(e)}
            {e.location && ` · ${e.location}`}
          </span>
        </span>
        <span className="sr-only">{eventDayKey(e.starts_at)}</span>
      </button>
    </li>
  );
}

export function EventDetail({ event: e }: { event: EventItem }) {
  return (
    <div className="space-y-4 px-5 pb-[max(env(safe-area-inset-bottom),20px)]">
      <p className="text-[15px] text-text-2">{eventWhen(e)}</p>
      {e.location && (
        <p className="flex items-center gap-2 text-[15px] text-text-1">
          <MapPin size={18} strokeWidth={1.75} className="shrink-0 text-text-3" aria-hidden="true" />
          {e.location}
        </p>
      )}
      {e.description && <p className="whitespace-pre-line text-[15px] leading-[1.5] text-text-1">{e.description}</p>}
      <div className="flex flex-wrap gap-3 pt-2">
        <a
          href={`/api/agenda/${e.id}.ics`}
          className="pressable inline-flex h-11 items-center gap-2 rounded-[12px] bg-bg-2 px-4 text-[15px] font-semibold text-text-1"
        >
          <CalendarPlus size={18} strokeWidth={1.75} aria-hidden="true" />
          Ajouter à mon calendrier
        </a>
        {e.post && (
          <Link href={`/post/${e.post.slug}`} className="pressable inline-flex h-11 items-center rounded-[12px] px-4 text-[15px] font-medium text-navy-link">
            Voir la publication
          </Link>
        )}
      </div>
    </div>
  );
}
