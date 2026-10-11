import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { bunnyGuidOf, bunnyStillEncoding, bunnySyncMedia } from "@/lib/video/bunny-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * État d'une vidéo pour le lecteur du fil (sondé pendant le traitement en ligne) :
 * relit Bunny Stream si la vidéo y est encore en cours, puis renvoie la ligne média.
 * Réservé aux agents connectés (la ligne média est lisible par tous les agents).
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id || !z.uuid().safeParse(id).success) return NextResponse.json({ error: "identifiant invalide" }, { status: 400 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "non connecté" }, { status: 401 });
  const read = () => supabase.from("media").select("id, kind, video_status, hls_key, poster_key, width, height, duration_s, orientation, original_key, transcode_started_at").eq("id", id).maybeSingle();
  let { data: row } = await read();
  if (!row || row.kind !== "video") return NextResponse.json({ error: "média introuvable" }, { status: 404 });
  if (bunnyGuidOf(row) && bunnyStillEncoding(row)) {
    await bunnySyncMedia(id).catch(() => null);
    row = (await read()).data ?? row;
  }
  return NextResponse.json(
    { video_status: row.video_status, hls_key: row.hls_key, poster_key: row.poster_key, width: row.width, height: row.height, duration_s: row.duration_s, orientation: row.orientation },
    { headers: { "cache-control": "no-store" } },
  );
}
