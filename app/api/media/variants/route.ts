import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isCronAuthorized } from "@/lib/auth/cron";
import { getStorage } from "@/lib/storage";
import { mediaKeys } from "@/lib/media/keys";
import { makeAvatar, makeImageVariants } from "@/lib/media/variants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("variants"), mediaId: z.uuid(), originalKey: z.string().min(1).max(300).regex(/^originals\//) }),
  z.object({ kind: z.literal("avatar"), tempKey: z.string().min(1).max(300).regex(/^avatars\//), outKey: z.string().min(1).max(300).regex(/^avatars\//) }),
]);

/**
 * Seule fonction à embarquer sharp : variantes d'image (publications, messagerie) et avatars.
 * Appelée en interne (lib/media/remote-variants.ts) avec CRON_SECRET.
 */
export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "non autorisé" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "requête invalide" }, { status: 400 });
  const storage = getStorage();
  try {
    if (parsed.data.kind === "variants") {
      const { mediaId, originalKey } = parsed.data;
      const original = await storage.getObject(originalKey);
      const { variants, width, height, lqip } = await makeImageVariants(original);
      const keys = {
        thumb: mediaKeys.variant(mediaId, "thumb"),
        small: mediaKeys.variant(mediaId, "small"),
        medium: mediaKeys.variant(mediaId, "medium"),
        full: mediaKeys.variant(mediaId, "full"),
      };
      await Promise.all([
        storage.putObject(keys.thumb, variants.thumb, "image/webp"),
        storage.putObject(keys.small, variants.small, "image/webp"),
        storage.putObject(keys.medium, variants.medium, "image/webp"),
        storage.putObject(keys.full, variants.full, "image/webp"),
      ]);
      return NextResponse.json({ variants: keys, width, height, lqip: lqip ?? null });
    }
    const { tempKey, outKey } = parsed.data;
    const original = await storage.getObject(tempKey);
    const webp = await makeAvatar(original);
    await storage.putObject(outKey, webp, "image/webp");
    storage.deleteObjects([tempKey]).catch(() => {});
    return NextResponse.json({ key: outKey });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "traitement impossible" }, { status: 500 });
  }
}
