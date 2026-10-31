import { MATRICULE_RE, normalizeMatricule } from "@/lib/auth/first-access-public";
import type { AgentStatus } from "@/lib/supabase/database.types";

export type RegistryRow = {
  line: number;
  matricule: string;
  last_name: string | null;
  first_name: string | null;
  email: string | null;
  center_name: string | null;
  status: AgentStatus | null;
  existing: boolean;
  error: string | null;
};
const HEADER_ALIASES: Record<string, keyof Omit<RegistryRow, "line" | "existing" | "error">> = {
  matricule: "matricule",
  mat: "matricule",
  numero: "matricule",
  nom: "last_name",
  "nom de famille": "last_name",
  prenom: "first_name",
  "prénom": "first_name",
  email: "email",
  "e-mail": "email",
  mail: "email",
  courriel: "email",
  "adresse e-mail": "email",
  centre: "center_name",
  cis: "center_name",
  affectation: "center_name",
  statut: "status",
  status: "status",
  grade: "status",
};
const DEFAULT_ORDER: (keyof Omit<RegistryRow, "line" | "existing" | "error">)[] = ["matricule", "last_name", "first_name", "email", "center_name", "status"];

function normalizeHeader(h: string) {
  return h
    .trim()
    .toLowerCase()
    .replace(/^"|"$/g, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/é/g, "e");
}
function parseStatus(raw: string | null): AgentStatus | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return null;
  if (/^spv|volontaire/.test(v)) return "spv";
  if (/^spp|professionnel/.test(v)) return "spp";
  if (/^jsp|jeune/.test(v)) return "jsp";
  if (/^pats|administratif|technique/.test(v)) return "pats";
  return null;
}
function clean(v: string | undefined): string | null {
  const s = (v ?? "").trim().replace(/^"|"$/g, "").trim();
  return s && s !== "-" ? s : null;
}

/**
 * Lecture d'un tableau collé (Excel) ou d'un CSV : séparateur tabulation, point-virgule ou
 * virgule ; première ligne = en-têtes (matricule, nom, prénom, e-mail, centre, statut, dans
 * n'importe quel ordre) ou, sans en-têtes reconnus, cet ordre par défaut.
 */
export function parseRegistryText(text: string): RegistryRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/ /g, " ")).filter((l) => l.trim());
  if (!lines.length) return [];
  const sep = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
  const split = (l: string) => l.split(sep);
  const headerCells = split(lines[0]).map(normalizeHeader);
  const recognized = headerCells.map((h) => HEADER_ALIASES[h]).filter(Boolean);
  const hasHeader = recognized.includes("matricule");
  const order = hasHeader ? headerCells.map((h) => HEADER_ALIASES[h] ?? null) : DEFAULT_ORDER;
  const rows: RegistryRow[] = [];
  const seen = new Set<string>();
  lines.slice(hasHeader ? 1 : 0).forEach((l, i) => {
    const cells = split(l);
    const get = (k: keyof Omit<RegistryRow, "line" | "existing" | "error">) => {
      const idx = order.indexOf(k);
      return idx >= 0 ? clean(cells[idx]) : null;
    };
    const matricule = normalizeMatricule(get("matricule") ?? "");
    const row: RegistryRow = {
      line: i + (hasHeader ? 2 : 1),
      matricule,
      last_name: get("last_name"),
      first_name: get("first_name"),
      email: get("email")?.toLowerCase() ?? null,
      center_name: get("center_name"),
      status: parseStatus(get("status")),
      existing: false,
      error: null,
    };
    if (!matricule || !MATRICULE_RE.test(matricule)) row.error = "Matricule manquant ou invalide (3 à 12 lettres ou chiffres).";
    else if (seen.has(matricule)) row.error = "Matricule en double dans le fichier.";
    else if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) row.error = "Adresse e-mail invalide.";
    if (matricule) seen.add(matricule);
    rows.push(row);
  });
  return rows;
}

