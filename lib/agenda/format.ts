/** Mise en forme des dates d'événements, toujours en heure de Paris. */
const TZ = "Europe/Paris";

const dayNum = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, day: "numeric" });
const weekdayShort = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, weekday: "short" });
const monthYear = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, month: "long", year: "numeric" });
const longDate = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
const time = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dayKeyFmt = new Intl.DateTimeFormat("fr-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function eventDayNumber(iso: string) {
  return dayNum.format(new Date(iso));
}
export function eventWeekday(iso: string) {
  return weekdayShort.format(new Date(iso)).replace(".", "");
}
export function eventMonthYear(iso: string) {
  return cap(monthYear.format(new Date(iso)));
}
/** Clé « YYYY-MM-DD » (Paris) pour regrouper par jour. */
export function eventDayKey(iso: string) {
  return dayKeyFmt.format(new Date(iso));
}
export function eventTime(iso: string) {
  return time.format(new Date(iso)).replace(":", "h");
}

/**
 * Ligne de date lisible : « Samedi 20 septembre, 9h00 – 12h30 »,
 * « Toute la journée », ou « Du 3 au 5 octobre » pour plusieurs jours.
 */
export function eventWhen(e: { starts_at: string; ends_at: string | null; all_day: boolean }) {
  const start = new Date(e.starts_at);
  const end = e.ends_at ? new Date(e.ends_at) : null;
  const sameDay = !end || eventDayKey(e.starts_at) === eventDayKey(e.ends_at!);
  if (e.all_day) {
    if (sameDay) return `${cap(longDate.format(start))} · toute la journée`;
    return `Du ${longDate.format(start)} au ${longDate.format(end!)}`;
  }
  if (sameDay) return `${cap(longDate.format(start))} · ${eventTime(e.starts_at)}${end ? ` – ${eventTime(e.ends_at!)}` : ""}`;
  return `Du ${longDate.format(start)} ${eventTime(e.starts_at)} au ${longDate.format(end!)} ${eventTime(e.ends_at!)}`;
}

/** Version courte pour une ligne de liste : « 9h00 – 12h30 », « Toute la journée », « → 5 oct. » */
export function eventShortTime(e: { starts_at: string; ends_at: string | null; all_day: boolean }) {
  if (e.all_day) return "Toute la journée";
  const end = e.ends_at && eventDayKey(e.starts_at) === eventDayKey(e.ends_at) ? ` – ${eventTime(e.ends_at)}` : "";
  return `${eventTime(e.starts_at)}${end}`;
}

export function isPast(e: { starts_at: string; ends_at: string | null }, now = Date.now()) {
  return new Date(e.ends_at ?? e.starts_at).getTime() < now;
}
export function isToday(e: { starts_at: string }, now = Date.now()) {
  return eventDayKey(e.starts_at) === eventDayKey(new Date(now).toISOString());
}
