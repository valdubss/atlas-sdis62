import type { Metadata } from "next";
import { EditorialCalendar } from "@/components/studio/EditorialCalendar";
import { addDays, startOfWeek } from "@/lib/studio/calendar";
import { fetchCalendar } from "./actions";

export const metadata: Metadata = { title: "Calendrier éditorial" };
export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const from = startOfWeek(new Date());
  const to = addDays(from, 7);
  const items = await fetchCalendar(from.toISOString(), to.toISOString());
  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <div>
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text-1">Calendrier</h1>
        <p className="text-[13px] text-text-3">Publications, stories, flashs et événements programmés ou publiés ; brouillons à gauche.</p>
      </div>
      <EditorialCalendar initial={items} initialFrom={from.toISOString()} initialTo={to.toISOString()} />
    </div>
  );
}
