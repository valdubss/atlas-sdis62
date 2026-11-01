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
  /** AAAA-MM-JJ */
  birth_date: string | null;
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
  "e-mail sdis": "email",
  "email sdis": "email",
  "mail sdis": "email",
  centre: "center_name",
  cis: "center_name",
  affectation: "center_name",
  statut: "status",
  status: "status",
  grade: "status",
  "date de naissance": "birth_date",
  "date naissance": "birth_date",
  naissance: "birth_date",
  "ne le": "birth_date",
  "ne(e) le": "birth_date",
  "nee le": "birth_date",
  ddn: "birth_date",
};
const DEFAULT_ORDER: (keyof Omit<RegistryRow, "line" | "existing" | "error">)[] = ["matricule", "last_name", "first_name", "email", "center_name", "status", "birth_date"];

function normalizeHeader(h: string) {
  return h
    .trim()
    .toLowerCase()
    .replace(/^"|"$/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim()
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
/**
 * Date de naissance : jj/mm/aaaa (ou - . comme séparateur, année sur deux chiffres acceptée),
 * aaaa-mm-jj, ou numéro de série Excel. Renvoie AAAA-MM-JJ, null si vide, "invalid" sinon.
 */
export function parseBirthDate(raw: string | null): string | null | "invalid" {
  const v = (raw ?? "").trim();
  if (!v) return null;
  let y: number, m: number, d: number;
  let r: RegExpMatchArray | null;
  if ((r = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/))) {
    [d, m, y] = [Number(r[1]), Number(r[2]), Number(r[3])];
    if (r[3].length === 2) y += y > new Date().getFullYear() % 100 ? 1900 : 2000;
  } else if (/^\d{5}$/.test(v)) {
    const t = new Date(Date.UTC(1899, 11, 30) + Number(v) * 86_400_000);
    [y, m, d] = [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
  } else return "invalid";
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return "invalid";
  if (y < 1920 || y > new Date().getFullYear() - 8) return "invalid";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function clean(v: string | undefined): string | null {
  const s = (v ?? "").trim().replace(/^"|"$/g, "").trim();
  return s && s !== "-" ? s : null;
}

/**
 * Lecture d'un tableau collé (Excel) ou d'un CSV : séparateur tabulation, point-virgule ou
 * virgule ; première ligne = en-têtes (matricule, nom, prénom, e-mail, centre, statut, date de
 * naissance, dans n'importe quel ordre) ou, sans en-têtes reconnus, cet ordre par défaut.
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
    const birth = parseBirthDate(get("birth_date"));
    const row: RegistryRow = {
      line: i + (hasHeader ? 2 : 1),
      matricule,
      last_name: get("last_name"),
      first_name: get("first_name"),
      email: get("email")?.toLowerCase() ?? null,
      center_name: get("center_name"),
      status: parseStatus(get("status")),
      birth_date: birth === "invalid" ? null : birth,
      existing: false,
      error: null,
    };
    if (!matricule || !MATRICULE_RE.test(matricule)) row.error = "Matricule manquant ou invalide (3 à 12 lettres ou chiffres).";
    else if (seen.has(matricule)) row.error = "Matricule en double dans le fichier.";
    else if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) row.error = "Adresse e-mail invalide.";
    else if (birth === "invalid") row.error = "Date de naissance invalide (jj/mm/aaaa).";
    if (matricule) seen.add(matricule);
    rows.push(row);
  });
  return rows;
}

