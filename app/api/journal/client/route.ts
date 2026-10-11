import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  message: z.string().trim().min(1).max(500),
  stack: z.string().max(3000).nullable().optional(),
  url: z.string().max(500).nullable().optional(),
  context: z.record(z.string(), z.union([z.string().max(300), z.number(), z.boolean(), z.null()])).optional(),
});

/**
 * Journal des erreurs côté appareil (lib/client-errors.ts) : agents connectés seulement,
 * 30 entrées par heure et par compte au plus, lisible dans Administration → Journal.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ ok: false }, { status: 400 });
  const admin = createAdminClient();
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin.from("client_errors").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", since);
  if ((count ?? 0) >= 30) return NextResponse.json({ ok: true, dropped: true });
  const v = body.data;
  await admin.from("client_errors").insert({
    user_id: user.id,
    message: v.message,
    stack: v.stack ?? null,
    url: v.url ?? null,
    user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300) || null,
    context: v.context ?? {},
  });
  return NextResponse.json({ ok: true });
}
