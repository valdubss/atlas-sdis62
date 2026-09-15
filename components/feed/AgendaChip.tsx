import Link from "next/link";
import { CalendarDays, ChevronRight } from "lucide-react";
import type { EventItem } from "@/lib/agenda/queries";
import { eventDayNumber, eventShortTime, eventWeekday } from "@/lib/agenda/format";

/** Pastille « Agenda » sous les stories : prochain événement du service, lien vers l'agenda complet. */
export function AgendaChip({ next }: { next: EventItem | null }) {
  return (
    <Link href="/agenda" className="pressable flex items-center gap-3 rounded-[16px] bg-bg-1 px-4 py-2.5">
      {next ? (
        <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-[10px] bg-bg-2 leading-none text-text-1" aria-hidden="true">
          <span className="text-[9px] font-medium uppercase tracking-[0.08em] opacity-80">{eventWeekday(next.starts_at)}</span>
          <span className="mt-0.5 text-[17px] font-semibold tabular-nums">{eventDayNumber(next.starts_at)}</span>
        </span>
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-bg-2 text-text-2" aria-hidden="true">
          <CalendarDays size={20} strokeWidth={1.75} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-text-3">Agenda</span>
        <span className="block truncate text-[15px] text-text-1">{next ? `${next.title} · ${eventShortTime(next)}` : "Rien de prévu pour le moment"}</span>
      </span>
      <ChevronRight size={20} strokeWidth={1.75} className="shrink-0 text-text-3" aria-hidden="true" />
    </Link>
  );
}
