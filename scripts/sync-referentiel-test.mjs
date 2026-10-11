// Copie le référentiel (groupements, services, centres — sans donnée personnelle) de la
// production (.env.local) vers le projet de test (.env.test.local), pose la liste blanche
// d'adresses et crée le compte administrateur initial sur le projet de test.
//   npm run referentiel:sync-test
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const load = (f) => Object.fromEntries(fs.readFileSync(f, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const prod = load(".env.local");
const test = load(".env.test.local");
if (!/zrwaybfwteagfpaxkqzr/.test(test.NEXT_PUBLIC_SUPABASE_URL ?? "")) throw new Error(".env.test.local ne pointe pas sur atlas-test");
if (prod.NEXT_PUBLIC_SUPABASE_URL === test.NEXT_PUBLIC_SUPABASE_URL) throw new Error("source et cible identiques");
const src = createClient(prod.NEXT_PUBLIC_SUPABASE_URL, prod.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const dst = createClient(test.NEXT_PUBLIC_SUPABASE_URL, test.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const EXCLUDE = new Set(["chief_id", "chief_name", "chief_email", "com_name", "com_email", "cover_media_id", "pending_cover_media_id", "manager_id", "created_by", "updated_at", "created_at", "presentation_pending", "headcount"]);
for (const table of ["groupings", "services", "centers"]) {
  const { data, error } = await src.from(table).select("*");
  if (error) throw new Error(`${table} (prod) : ${error.message}`);
  const rows = data.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !EXCLUDE.has(k))));
  const { error: upErr } = await dst.from(table).upsert(rows, { onConflict: "id" });
  if (upErr) throw new Error(`${table} (test) : ${upErr.message}`);
  console.log(`${table} : ${rows.length} ligne(s) copiée(s)`);
}

// Liste blanche (adresse hors domaine de l'administrateur) et repli des rattachements
const { data: settings } = await src.from("app_settings").select("key, value").in("key", ["allowed_emails", "allowed_email_domains", "membership_fallback_email"]);
for (const s of settings ?? []) {
  const { error } = await dst.from("app_settings").upsert({ key: s.key, value: s.value }, { onConflict: "key" });
  if (error) throw new Error(`app_settings ${s.key} : ${error.message}`);
}
console.log("réglages copiés :", (settings ?? []).map((s) => s.key).join(", "));

// Compte administrateur initial (même adresse que la production) : mot de passe choisi à la première connexion
const adminEmail = (test.ALLOWED_EMAILS ?? prod.ALLOWED_EMAILS ?? "").split(",")[0]?.trim();
if (adminEmail) {
  const { data: existing } = await dst.from("profiles").select("id, role").ilike("email", adminEmail).maybeSingle();
  let id = existing?.id ?? null;
  if (!id) {
    const { data: created, error } = await dst.auth.admin.createUser({ email: adminEmail, email_confirm: true, user_metadata: { first_name: "Valentin", last_name: "Dubois" } });
    if (error) throw new Error(`compte admin : ${error.message}`);
    id = created.user.id;
  }
  await dst.from("profiles").update({ role: "admin", onboarded_at: new Date().toISOString() }).eq("id", id);
  console.log(`compte administrateur prêt sur le projet de test : ${adminEmail} (mot de passe à définir via « Première connexion ou mot de passe oublié »)`);
}
