import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { fetchEventById } from "@/lib/agenda/queries";
import { APP_NAME } from "@/lib/config";

export const dynamic = "force-dynamic";

/** Fichier iCalendar d'un événement : « Ajouter à mon calendrier » (agent connecté). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = raw.replace(/\.ics$/i, "");
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "identifiant invalide" }, { status: 400 });
  const e = await fetchEventById(id);
  if (!e || e.status !== "published") return NextResponse.json({ error: "introuvable" }, { status: 404 });

  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  const start = new Date(e.starts_at);
  const end = e.ends_at ? new Date(e.ends_at) : new Date(start.getTime() + (e.all_day ? 0 : 3600_000));
  const dt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const day = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${APP_NAME}//Agenda//FR`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.id}@atlas-sdis62`,
    `DTSTAMP:${dt(new Date())}`,
    e.all_day ? `DTSTART;VALUE=DATE:${day(start)}` : `DTSTART:${dt(start)}`,
    e.all_day ? `DTEND;VALUE=DATE:${day(new Date(end.getTime() + 86_400_000))}` : `DTEND:${dt(end)}`,
    `SUMMARY:${esc(e.title)}`,
    e.location ? `LOCATION:${esc(e.location)}` : null,
    e.description ? `DESCRIPTION:${esc(e.description)}` : null,
    e.post && site ? `URL:${site}/post/${e.post.slug}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((l): l is string => Boolean(l));

  return new NextResponse(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${e.title.replace(/[^\w\-]+/g, "-").slice(0, 60) || "evenement"}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
