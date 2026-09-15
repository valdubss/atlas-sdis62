import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { fetchEventById } from "@/lib/agenda/queries";
import { APP_NAME } from "@/lib/config";
import { buildIcs, icsFilename } from "@/lib/agenda/ics";

export const dynamic = "force-dynamic";

/** Fichier iCalendar d'un événement : « Ajouter à mon calendrier » (agent connecté). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = raw.replace(/\.ics$/i, "");
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "identifiant invalide" }, { status: 400 });
  const e = await fetchEventById(id);
  if (!e || e.status !== "published") return NextResponse.json({ error: "introuvable" }, { status: 404 });

  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  const body = buildIcs({ ...e, url: e.post && site ? `${site}/post/${e.post.slug}` : null }, APP_NAME);

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${icsFilename(e.title)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
