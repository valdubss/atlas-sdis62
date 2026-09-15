import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildVCard, vcardFilename } from "@/lib/annuaire/vcard";
import { APP_NAME } from "@/lib/config";

/** Fiche vCard d'un centre ou d'un service (agents connectés ; aucune donnée personnelle). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string; slug: string }> }) {
  const { kind, slug } = await params;
  if (!/^[a-z0-9-]{1,80}$/.test(slug) || (kind !== "centre" && kind !== "service")) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "non connecté" }, { status: 401 });
  const origin = req.nextUrl.origin;
  const row =
    kind === "centre"
      ? (await supabase.from("centers").select("name, phone, email, address, postal_code, city, presentation").eq("slug", slug).eq("is_active", true).maybeSingle()).data
      : (await supabase.from("services").select("name, phone, email, address, short_description").eq("slug", slug).eq("is_active", true).maybeSingle()).data;
  if (!row) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  const card = buildVCard({
    name: row.name,
    org: `SDIS 62 · ${APP_NAME}`,
    phone: row.phone,
    email: row.email,
    address: row.address,
    postal_code: "postal_code" in row ? row.postal_code : null,
    city: "city" in row ? row.city : null,
    url: `${origin}/${kind}/${slug}`,
    note: "presentation" in row ? row.presentation : row.short_description,
  });
  return new NextResponse(card, {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `attachment; filename="${vcardFilename(slug)}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
