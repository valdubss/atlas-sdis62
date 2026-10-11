"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type ImportRow = {
  line: number;
  input: string;
  center: { id: string; name: string } | null;
  chief_name: string | null;
  chief_email: string | null;
  com_name: string | null;
  com_email: string | null;
  changed: boolean;
  error: string | null;
};
export type ImportResult = { ok: true; rows: ImportRow[]; applied: number; matched: number } | { ok: false; error: string };

/** Clé de comparaison : sans accents, minuscules, sans « CIS / CS / CPI / centre » ni ponctuation. */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(cis|cs|cpi|csp|centre|de|du|des|d|le|la|les|et)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function splitLine(line: string): string[] {
  const sep = line.includes(";") ? ";" : line.includes("\t") ? "\t" : ",";
  return line.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, "$1").trim());
}

const emailSchema = z.string().trim().toLowerCase().max(160);
const isEmail = (s: string) => z.email().safeParse(s).success;

/**
 * Import des chefs de centre et responsables communication depuis un tableau collé ou un
 * fichier CSV (séparateur « ; », tabulation ou virgule), une ligne par centre :
 *   centre ; chef de centre ; e-mail du chef ; responsable com ; e-mail du responsable com
 * Les noms sont facultatifs : les cellules contenant « @ » sont des adresses, les autres des
 * noms, dans l'ordre chef puis com. Une cellule vide laisse la valeur actuelle ; « - » l'efface.
 * `apply = false` : vérification seule (aperçu). Réservé aux administrateurs et éditeurs.
 */
export async function importCenterContacts(text: string, apply: boolean): Promise<ImportResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Session expirée." };
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (me?.role !== "admin" && me?.role !== "editor") return { ok: false, error: "Réservé au service communication." };

  const { data: centers } = await supabase.from("centers").select("id, name, slug, city, chief_name, chief_email, com_name, com_email");
  const list = centers ?? [];
  const byKey = new Map<string, typeof list>();
  const add = (k: string, c: (typeof list)[number]) => {
    if (!k) return;
    byKey.set(k, [...(byKey.get(k) ?? []), c]);
  };
  for (const c of list) {
    add(norm(c.name), c);
    add(norm(c.slug.replace(/-/g, " ")), c);
    if (c.city) add(norm(c.city), c);
  }
  const find = (label: string) => {
    const k = norm(label);
    if (!k) return { center: null, error: "Centre vide." };
    const exact = byKey.get(k);
    if (exact && new Set(exact.map((c) => c.id)).size === 1) return { center: exact[0], error: null };
    if (exact && exact.length > 1) return { center: null, error: "Plusieurs centres correspondent : précisez le nom." };
    const partial = list.filter((c) => norm(c.name).includes(k) || k.includes(norm(c.name)));
    if (partial.length === 1) return { center: partial[0], error: null };
    return { center: null, error: partial.length > 1 ? "Plusieurs centres correspondent : précisez le nom." : "Centre introuvable." };
  };

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 500);
  const rows: ImportRow[] = [];
  lines.forEach((line, i) => {
    const cells = splitLine(line);
    if (i === 0 && !line.includes("@") && /centre|chef|mail|com/i.test(line)) return; // en-tête
    const [label, ...rest] = cells;
    const emails = rest.filter((c) => c.includes("@"));
    const names = rest.filter((c) => c && !c.includes("@"));
    const row: ImportRow = { line: i + 1, input: label ?? "", center: null, chief_name: names[0] ?? null, chief_email: emails[0] ?? null, com_name: names[1] ?? null, com_email: emails[1] ?? null, changed: false, error: null };
    const found = find(label ?? "");
    if (!found.center) {
      row.error = found.error;
      rows.push(row);
      return;
    }
    row.center = { id: found.center.id, name: found.center.name };
    for (const k of ["chief_email", "com_email"] as const) {
      const v = row[k];
      if (v && v !== "-") {
        const parsed = emailSchema.safeParse(v);
        if (!parsed.success || !isEmail(parsed.data)) {
          row.error = `Adresse invalide : ${v}`;
          break;
        }
        row[k] = parsed.data;
      }
    }
    if (row.error) {
      rows.push(row);
      return;
    }
    const next = {
      chief_name: row.chief_name === "-" ? null : (row.chief_name ?? found.center.chief_name),
      chief_email: row.chief_email === "-" ? null : (row.chief_email ?? found.center.chief_email),
      com_name: row.com_name === "-" ? null : (row.com_name ?? found.center.com_name),
      com_email: row.com_email === "-" ? null : (row.com_email ?? found.center.com_email),
    };
    row.changed = next.chief_name !== found.center.chief_name || next.chief_email !== found.center.chief_email || next.com_name !== found.center.com_name || next.com_email !== found.center.com_email;
    row.chief_name = next.chief_name;
    row.chief_email = next.chief_email;
    row.com_name = next.com_name;
    row.com_email = next.com_email;
    rows.push(row);
  });

  let applied = 0;
  if (apply) {
    for (const r of rows) {
      if (!r.center || r.error || !r.changed) continue;
      const { error } = await supabase.from("centers").update({ chief_name: r.chief_name, chief_email: r.chief_email, com_name: r.com_name, com_email: r.com_email }).eq("id", r.center.id);
      if (error) r.error = "Enregistrement refusé : " + error.message;
      else applied++;
    }
    revalidatePath("/centre");
    revalidatePath("/annuaire");
    revalidatePath("/admin/centres");
    revalidatePath("/admin");
  }
  return { ok: true, rows, applied, matched: rows.filter((r) => r.center && !r.error).length };
}
