/** Calendrier éditorial : formes partagées et helpers purs (testés). */
export type CalendarKind = "post" | "story" | "flash" | "event";
export type CalendarStatus = "draft" | "in_review" | "scheduled" | "published";
export type CalendarItem = { kind: CalendarKind; id: string; title: string; type: string; status: CalendarStatus; at: string | null; href: string };

export const STATUS_LABEL: Record<CalendarStatus, string> = { draft: "Brouillon", in_review: "En relecture", scheduled: "Programmé", published: "Publié" };
export const KIND_LABEL: Record<CalendarKind, string> = { post: "Publication", story: "Story", flash: "Flash", event: "Événement" };
export const TYPE_LABEL: Record<string, string> = { photo: "Photos", video: "Vidéo", text: "Annonce", article: "Article", poll: "Sondage", story: "Story", flash: "Flash", event: "Événement" };

/** Lundi 00:00 (heure locale) de la semaine contenant `d`. */
export function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

export function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Jours affichés : 7 pour la semaine, une grille complète de semaines pour le mois. */
export function visibleDays(view: "week" | "month", anchor: Date): Date[] {
  if (view === "week") {
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }
  const first = startOfMonth(anchor);
  const start = startOfWeek(first);
  const end = addDays(startOfWeek(new Date(first.getFullYear(), first.getMonth() + 1, 0)), 7);
  const days: Date[] = [];
  for (let d = start; d < end; d = addDays(d, 1)) days.push(d);
  return days;
}

/** Regroupe par jour local ; les éléments sans date vont dans « undated ». */
export function groupByDay(items: CalendarItem[]): { byDay: Map<string, CalendarItem[]>; undated: CalendarItem[] } {
  const byDay = new Map<string, CalendarItem[]>();
  const undated: CalendarItem[] = [];
  for (const it of items) {
    if (!it.at) {
      undated.push(it);
      continue;
    }
    const k = dayKey(new Date(it.at));
    byDay.set(k, [...(byDay.get(k) ?? []), it]);
  }
  for (const list of byDay.values()) list.sort((a, b) => (a.at! < b.at! ? -1 : 1));
  return { byDay, undated };
}

/** Nouvelle date : le jour cible avec l'heure d'origine (ou 9 h pour un élément sans date). */
export function moveToDay(at: string | null, day: Date): Date {
  const src = at ? new Date(at) : null;
  const x = new Date(day);
  x.setHours(src ? src.getHours() : 9, src ? src.getMinutes() : 0, 0, 0);
  return x;
}
