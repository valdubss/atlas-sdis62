import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { bunnyConfig, bunnySyncMedia, bunnyWebhookToken } from "@/lib/video/bunny-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Webhook Bunny Stream (bibliothèque → API → Webhook URL) :
 *   https://<site>/api/video/bunny?token=<jeton>
 * Le jeton est dérivé de la clé API (`npm run bunny:webhook` l'affiche). À chaque changement
 * d'état d'encodage, la ligne média correspondante est relue et mise à jour ; le sondage
 * (Studio, lecteur, cron) reste le filet de sécurité.
 */
export async function POST(req: NextRequest) {
  if (!bunnyConfig()) return NextResponse.json({ error: "Bunny Stream non configuré" }, { status: 404 });
  const given = Buffer.from(req.nextUrl.searchParams.get("token") ?? "");
  const expected = Buffer.from(bunnyWebhookToken());
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return NextResponse.json({ error: "jeton invalide" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { VideoLibraryId?: number | string; VideoGuid?: string; Status?: number } | null;
  const guid = body?.VideoGuid;
  if (!guid || !/^[0-9a-f-]{36}$/i.test(guid)) return NextResponse.json({ ok: true, ignored: "guid absent" });
  if (body?.VideoLibraryId && String(body.VideoLibraryId) !== bunnyConfig()!.libraryId) return NextResponse.json({ ok: true, ignored: "autre bibliothèque" });
  const db = createAdminClient();
  const { data: row } = await db.from("media").select("id").eq("kind", "video").ilike("hls_key", `%/${guid}/%`).maybeSingle();
  if (!row) return NextResponse.json({ ok: true, ignored: "média inconnu" });
  const result = await bunnySyncMedia(row.id).catch((e) => ({ status: "failed", remaining: 0, error: String(e) }));
  return NextResponse.json({ ok: true, mediaId: row.id, ...result });
}
