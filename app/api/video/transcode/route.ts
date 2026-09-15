import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getVideoProvider } from "@/lib/video/provider";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Fluid Compute (Hobby) : 300 s. Si le déploiement refuse cette valeur, ramener à 60 : le job reprend par étapes. */
export const maxDuration = 300;

const BUDGET_MS = (Number(process.env.VIDEO_BUDGET_S) || 240) * 1000;

/**
 * Transcodage HLS d'une vidéo, par étapes dans le budget de temps. Appelé :
 *  - par le studio après l'upload (session éditeur ou référent propriétaire) ;
 *  - par le cron (`Authorization: Bearer CRON_SECRET`) pour les jobs restants.
 * Renvoie `remaining` : nombre de rendus encore à produire (relancer si > 0).
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { mediaId?: string } | null;
  const mediaId = body?.mediaId;
  if (!mediaId || !z.uuid().safeParse(mediaId).success) return NextResponse.json({ error: "identifiant invalide" }, { status: 400 });

  const byCron = Boolean(process.env.CRON_SECRET) && req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  if (!byCron) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "non connecté" }, { status: 401 });
    const { data: media } = await supabase.from("media").select("id, owner_id, kind").eq("id", mediaId).maybeSingle();
    if (!media || media.kind !== "video") return NextResponse.json({ error: "média introuvable" }, { status: 404 });
    if (media.owner_id !== user.id) {
      const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (me?.role !== "editor" && me?.role !== "admin") return NextResponse.json({ error: "non autorisé" }, { status: 403 });
    }
  }

  const provider = await getVideoProvider();
  const result = await provider.run(mediaId, BUDGET_MS);
  return NextResponse.json(result, { status: result.status === "failed" ? 500 : 200 });
}
