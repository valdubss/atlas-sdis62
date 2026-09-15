/** Génération d'un fichier iCalendar (un événement), partagée par la route .ics et les tests. */
export type IcsEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  url?: string | null;
};

export function escapeIcs(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

export function buildIcs(e: IcsEvent, prodId = "ATLAS", now = new Date()) {
  const start = new Date(e.starts_at);
  const end = e.ends_at ? new Date(e.ends_at) : new Date(start.getTime() + (e.all_day ? 0 : 3600_000));
  const dt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const day = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${prodId}//Agenda//FR`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.id}@atlas-sdis62`,
    `DTSTAMP:${dt(now)}`,
    e.all_day ? `DTSTART;VALUE=DATE:${day(start)}` : `DTSTART:${dt(start)}`,
    e.all_day ? `DTEND;VALUE=DATE:${day(new Date(end.getTime() + 86_400_000))}` : `DTEND:${dt(end)}`,
    `SUMMARY:${escapeIcs(e.title)}`,
    e.location ? `LOCATION:${escapeIcs(e.location)}` : null,
    e.description ? `DESCRIPTION:${escapeIcs(e.description)}` : null,
    e.url ? `URL:${e.url}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((l): l is string => Boolean(l));
  return lines.join("\r\n") + "\r\n";
}

export function icsFilename(title: string) {
  return `${title.replace(/[^\w\-]+/g, "-").slice(0, 60) || "evenement"}.ics`;
}
