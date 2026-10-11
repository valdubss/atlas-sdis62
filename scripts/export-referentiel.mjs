// Exporte le référentiel (groupements, services, centres) du projet de .env.local vers un
// fichier SQL rejouable sur le projet de test : npm run referentiel:export
// Lecture seule ; aucune donnée personnelle (ni agents, ni contacts chef/com, ni photos).
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Colonnes jamais exportées (personnes, médias, compteurs)
const EXCLUDE = new Set(["chief_id", "chief_name", "chief_email", "com_name", "com_email", "cover_media_id", "pending_cover_media_id", "manager_id", "created_by", "updated_at", "created_at", "presentation_pending", "headcount"]);

const lit = (v) => (v === null || v === undefined ? "null" : typeof v === "number" ? String(v) : typeof v === "boolean" ? (v ? "true" : "false") : typeof v === "object" ? `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb` : `'${String(v).replace(/'/g, "''")}'`);
const rows = async (table, order) => {
  const { data, error } = await admin.from(table).select("*").order(order);
  if (error) throw new Error(`${table}: ${error.message}`);
  if (!data.length) return `-- ${table} : vide\n`;
  const cols = Object.keys(data[0]).filter((c) => !EXCLUDE.has(c));
  return `insert into public.${table} (${cols.join(", ")}) values\n${data.map((r) => `  (${cols.map((c) => lit(r[c])).join(", ")})`).join(",\n")}\non conflict (id) do update set ${cols.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`).join(", ")};\n`;
};

const out = [
  "-- Référentiel exporté de la production (groupements, services, centres) — sans aucune donnée personnelle.",
  `-- Généré le ${new Date().toISOString()} par scripts/export-referentiel.mjs ; à rejouer dans l'éditeur SQL du projet de test.`,
  "",
  await rows("groupings", "name"),
  await rows("services", "name"),
  await rows("centers", "name"),
].join("\n");
fs.mkdirSync("supabase/tests", { recursive: true });
fs.writeFileSync("supabase/tests/fixtures-referentiel.sql", out, "utf8");
console.log(`supabase/tests/fixtures-referentiel.sql écrit (${out.length} caractères)`);
