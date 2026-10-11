import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { mediaUrl } from "@/lib/media/url";

export const dynamic = "force-dynamic";

/**
 * Ouverture d'un document : adresse same-origin stable (`/documents/f/<id>`), servie par le
 * service worker depuis le cache quand le document a été gardé hors ligne ; sinon
 * redirection vers le fichier du stockage. Agents connectés seulement.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "identifiant invalide" }, { status: 400 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/documents/f/${id}`)}`, _req.url));
  const { data: doc } = await supabase.from("documents").select("file_key").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!doc) return NextResponse.json({ error: "document introuvable" }, { status: 404 });
  return NextResponse.redirect(mediaUrl(doc.file_key), { status: 302, headers: { "cache-control": "private, no-store" } });
}
