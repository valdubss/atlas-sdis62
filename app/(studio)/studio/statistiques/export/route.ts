import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Stats } from "../page";

export const dynamic = "force-dynamic";

/** Export CSV des statistiques par publication (éditeurs, via la RPC protégée). */
export async function GET(req: NextRequest) {
  const days = [7, 30, 90].includes(Number(req.nextUrl.searchParams.get("jours"))) ? Number(req.nextUrl.searchParams.get("jours")) : 30;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("studio_post_stats", { p_days: days });
  if (error || !data) return NextResponse.json({ error: "non autorisé" }, { status: 403 });
  const s = data as unknown as Stats;
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [
    ["Titre", "Type", "Mise en ligne", "Vues", "Réactions", "Commentaires", "Favoris", "Lien"].map(esc).join(";"),
    ...s.posts.map((p) => [p.title ?? "Sans titre", p.type, p.published_at, p.views, p.reactions, p.comments, p.bookmarks, `/post/${p.slug}`].map(esc).join(";")),
    "",
    ["Période (jours)", days].map(esc).join(";"),
    ["Agents actifs", s.agents].map(esc).join(";"),
    ["Agents ayant lu", s.active_agents].map(esc).join(";"),
    ["Abonnés push", s.subscribers].map(esc).join(";"),
    ["Vues", s.totals.views].map(esc).join(";"),
    ["Réactions", s.totals.reactions].map(esc).join(";"),
    ["Commentaires", s.totals.comments].map(esc).join(";"),
    ["Favoris", s.totals.bookmarks].map(esc).join(";"),
    ["Vues de stories", s.totals.story_views].map(esc).join(";"),
    ["Push envoyées", s.totals.push_sent].map(esc).join(";"),
  ];
  const csv = "﻿" + rows.join("\r\n") + "\r\n";
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="atlas-statistiques-${days}j.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
