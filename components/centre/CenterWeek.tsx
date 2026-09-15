"use client";

import { useState } from "react";
import type { EventItem } from "@/lib/agenda/queries";
import { eventDayNumber, eventShortTime, eventWeekday, isToday } from "@/lib/agenda/format";
import { EventDetail } from "@/components/agenda/AgendaList";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/cn";

/** « Cette semaine » : événements du centre sur 7 jours, feuille de détail avec .ics. */
export function CenterWeek({ events }: { events: EventItem[] }) {
  const [open, setOpen] = useState<EventItem | null>(null);
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-[17px] font-semibold tracking-[-0.02em] text-text-1">Cette semaine</h2>
      <div className="hairline rounded-[16px] bg-bg-1">
        {events.length === 0 ? (
          <p className="px-4 py-4 text-[15px] text-text-2">Rien de prévu dans les 7 prochains jours.</p>
        ) : (
          <ul>
            {events.map((e) => {
              const today = isToday(e);
              return (
                <li key={e.id}>
                  <button type="button" onClick={() => setOpen(e)} className="pressable flex w-full items-center gap-4 px-4 py-3 text-left">
                    <span className={cn("flex h-[48px] w-[48px] shrink-0 flex-col items-center justify-center rounded-[12px] leading-none", today ? "bg-red-fill text-white" : "bg-bg-2 text-text-1")} aria-hidden="true">
                      <span className="text-[10px] font-medium uppercase tracking-[0.08em] opacity-80">{eventWeekday(e.starts_at)}</span>
                      <span className="mt-0.5 text-[20px] font-semibold tabular-nums">{eventDayNumber(e.starts_at)}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-text-1">{e.title}</span>
                      <span className="block truncate text-[13px] text-text-3">
                        {eventShortTime(e)}
                        {e.location && ` · ${e.location}`}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <Sheet open={open !== null} onClose={() => setOpen(null)} title={open?.title ?? "Événement"}>
        {open && <EventDetail event={open} />}
      </Sheet>
    </section>
  );
}
