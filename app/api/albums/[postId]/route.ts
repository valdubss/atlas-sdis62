import { NextResponse, type NextRequest } from "next/server";
import { zipSync } from "fflate";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { mediaUrl } from "@/lib/media/url";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_PHOTOS = 60;
const MAX_TOTAL = 150 * 1024 * 1024;

/**
 * Album d'une publication photo en une archive ZIP (variantes « full », 2 400 px, WebP) :
 * agents connectés, publications visibles par eux (RLS). Sans compression (les WebP le sont
 * déjà), 60 photos et 150 Mo au plus.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ postId: string }> }) {
  const { postId } = await ctx.params;
  if (!z.uuid().safeParse(postId).success) return NextResponse.json({ error: "identifiant invalide" }, { status: 400 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "non connecté" }, { status: 401 });
  const { data: post } = await supabase.from("posts").select("id, slug, title, published_at, status").eq("id", postId).maybeSingle();
  if (!post || post.status !== "published") return NextResponse.json({ error: "publication introuvable" }, { status: 404 });
  const { data: rows } = await supabase
    .from("post_media")
    .select("position, media:media!post_media_media_id_fkey(id, kind, variants, original_key, status)")
    .eq("post_id", postId)
    .order("position");
  const photos = ((rows ?? []) as unknown as { position: number; media: { id: string; kind: string; variants: Record<string, string> | null; status: string } | null }[])
    .map((r) => r.media)
    .filter((m): m is NonNullable<typeof m> => Boolean(m) && m!.kind === "image" && m!.status === "ready")
    .slice(0, MAX_PHOTOS);
  if (photos.length === 0) return NextResponse.json({ error: "aucune photo" }, { status: 404 });

  const files: Record<string, Uint8Array> = {};
  let total = 0;
  for (let i = 0; i < photos.length; i++) {
    const key = photos[i].variants?.full ?? photos[i].variants?.medium;
    if (!key) continue;
    const res = await fetch(mediaUrl(key), { cache: "no-store" });
    if (!res.ok) continue;
    const bytes = new Uint8Array(await res.arrayBuffer());
    total += bytes.length;
    if (total > MAX_TOTAL) break;
    files[`${String(i + 1).padStart(2, "0")}.webp`] = bytes;
  }
  if (Object.keys(files).length === 0) return NextResponse.json({ error: "photos indisponibles" }, { status: 502 });
  const zip = zipSync(files, { level: 0 });
  const body = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
  const name = `${(post.title ?? "album").replace(/[^\p{L}\p{N} _-]+/gu, "").trim().slice(0, 60) || "album"}.zip`;
  return new NextResponse(body, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "cache-control": "private, no-store",
    },
  });
}
