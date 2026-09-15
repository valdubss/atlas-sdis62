import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Clic sur une push (service worker) : ouverture enregistrée par agent, par contenu et par jour. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { tag?: string } | null;
  const tag = typeof body?.tag === "string" ? body.tag.slice(0, 120) : "";
  if (!tag) return NextResponse.json({ ok: false }, { status: 400 });
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_push_open", { p_tag: tag });
  return NextResponse.json({ ok: !error }, { status: error ? 401 : 200 });
}
