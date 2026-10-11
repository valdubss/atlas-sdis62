import { NextResponse, type NextRequest } from "next/server";
import { fetchAudit, type AuditEntry } from "../actions";

/** Export CSV du journal (filtres de la page, 2 000 lignes au plus). */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const filters = { actor: sp.get("acteur"), action: sp.get("action"), entity: sp.get("type"), from: sp.get("du"), to: sp.get("au") };
  const rows: AuditEntry[] = [];
  let cursor: number | null = null;
  for (let i = 0; i < 40; i++) {
    const page = await fetchAudit({ ...filters, cursor });
    rows.push(...page);
    if (page.length < 50) break;
    cursor = page[page.length - 1].id;
  }
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = ["date;acteur;action;type;identifiant;résumé;champs modifiés", ...rows.map((r) => [new Date(r.created_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" }), r.actor?.name ?? "", r.action, r.entity_type, r.entity_id ?? "", r.summary ?? "", r.changed.join(", ")].map(esc).join(";"))];
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="journal-atlas-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
