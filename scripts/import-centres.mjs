#!/usr/bin/env node
/**
 * Import en masse des groupements, centres et services depuis des fichiers CSV.
 *
 *   npm run import:centres -- docs/import/centres.csv
 *   npm run import:centres -- docs/import/centres.csv --services docs/import/services.csv
 *   npm run import:centres -- docs/import/centres.csv --dry-run
 *
 * Colonnes centres.csv (séparateur ; ou , détecté ; l'en-tête est obligatoire) :
 *   name*, type* (cis|cs|cpi|cta_codis|direction|service), grouping, slug,
 *   address, postal_code, city, phone, email, presentation, displayed_headcount,
 *   sort_order, lat, lng, is_active
 * Colonnes services.csv : name*, slug, short_description, mission, contact_reasons
 *   (séparées par |), grouping, phone, email, address, sort_order, is_active
 *
 * Les lignes sont fusionnées sur le slug (dérivé du nom si absent) : relancer
 * l'import met à jour les fiches existantes sans doublon. Les coordonnées
 * manquantes sont géocodées via la Base Adresse Nationale (api-adresse.data.gouv.fr).
 * Nécessite .env.local (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--services");
const servicesFile = args.includes("--services") ? args[args.indexOf("--services") + 1] : null;
const dryRun = args.includes("--dry-run");
if (!file) {
  console.error("Usage : node scripts/import-centres.mjs <centres.csv> [--services services.csv] [--dry-run]");
  process.exit(1);
}

const env = loadEnv();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const TYPES = new Set(["cis", "cs", "cpi", "cta_codis", "direction", "service"]);

const centres = parseCsv(fs.readFileSync(path.resolve(file), "utf8"));
const services = servicesFile ? parseCsv(fs.readFileSync(path.resolve(servicesFile), "utf8")) : [];
console.log(`${centres.length} centre(s), ${services.length} service(s) lus${dryRun ? " (simulation)" : ""}.`);

// 1. Groupements (créés à la volée depuis la colonne « grouping »)
const groupingNames = [...new Set([...centres, ...services].map((r) => (r.grouping ?? "").trim()).filter(Boolean))];
const groupingIds = new Map();
if (groupingNames.length) {
  const { data: existing, error } = await supabase.from("groupings").select("id, name");
  if (error) fail(error);
  for (const g of existing ?? []) groupingIds.set(g.name.toLowerCase(), g.id);
  let order = (existing ?? []).length;
  for (const name of groupingNames) {
    if (groupingIds.has(name.toLowerCase())) continue;
    order += 1;
    console.log(`+ groupement « ${name} »`);
    if (dryRun) continue;
    const { data, error: e } = await supabase.from("groupings").insert({ name, sort_order: order }).select("id").single();
    if (e) fail(e);
    groupingIds.set(name.toLowerCase(), data.id);
  }
}

// 2. Centres
let created = 0;
let updated = 0;
let geocoded = 0;
for (const [i, r] of centres.entries()) {
  const line = i + 2;
  const name = (r.name ?? "").trim();
  const type = (r.type ?? "cis").trim().toLowerCase();
  if (!name) {
    console.warn(`ligne ${line} : nom manquant, ignorée`);
    continue;
  }
  if (!TYPES.has(type)) {
    console.warn(`ligne ${line} : type « ${type} » inconnu, ignorée`);
    continue;
  }
  const slug = (r.slug ?? "").trim() || slugify(name);
  let lat = num(r.lat);
  let lng = num(r.lng);
  const address = text(r.address, 200);
  const postal = text(r.postal_code, 10);
  const city = text(r.city, 80);
  if ((lat === null || lng === null) && (address || city)) {
    const hit = await geocode([address, postal, city].filter(Boolean).join(" "), postal);
    if (hit) {
      [lng, lat] = hit;
      geocoded += 1;
    } else console.warn(`ligne ${line} : adresse non géocodée (${name})`);
  }
  const row = {
    slug,
    name: name.slice(0, 120),
    type,
    grouping_id: r.grouping ? (groupingIds.get(r.grouping.trim().toLowerCase()) ?? null) : null,
    address,
    postal_code: postal,
    city,
    phone: text(r.phone, 30),
    email: text(r.email, 160)?.toLowerCase() ?? null,
    presentation: text(r.presentation, 600),
    displayed_headcount: num(r.displayed_headcount),
    sort_order: Math.trunc(num(r.sort_order) ?? 0),
    lat,
    lng,
    is_active: bool(r.is_active, true),
  };
  if (dryRun) {
    console.log(`~ ${row.type} ${row.name} (${row.slug}) ${lat != null ? `${lat.toFixed(4)},${lng.toFixed(4)}` : "sans coordonnées"}`);
    continue;
  }
  const { data: found } = await supabase.from("centers").select("id").eq("slug", slug).maybeSingle();
  const { error } = await (found ? supabase.from("centers").update(row).eq("id", found.id) : supabase.from("centers").insert(row));
  if (error) {
    console.error(`ligne ${line} (${name}) : ${error.message}`);
    continue;
  }
  if (found) updated += 1;
  else created += 1;
}

// 3. Services
let sCreated = 0;
let sUpdated = 0;
for (const [i, r] of services.entries()) {
  const name = (r.name ?? "").trim();
  if (!name) continue;
  const slug = (r.slug ?? "").trim() || slugify(name);
  const row = {
    slug,
    name: name.slice(0, 120),
    short_description: text(r.short_description, 140),
    mission: text(r.mission, 2000),
    contact_reasons: (r.contact_reasons ?? "")
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3),
    grouping_id: r.grouping ? (groupingIds.get(r.grouping.trim().toLowerCase()) ?? null) : null,
    phone: text(r.phone, 30),
    email: text(r.email, 160)?.toLowerCase() ?? null,
    address: text(r.address, 200),
    sort_order: Math.trunc(num(r.sort_order) ?? 0),
    is_active: bool(r.is_active, true),
  };
  if (dryRun) {
    console.log(`~ service ${row.name} (${row.slug})`);
    continue;
  }
  const { data: found } = await supabase.from("services").select("id").eq("slug", slug).maybeSingle();
  const { error } = await (found ? supabase.from("services").update(row).eq("id", found.id) : supabase.from("services").insert(row));
  if (error) {
    console.error(`service ligne ${i + 2} (${name}) : ${error.message}`);
    continue;
  }
  if (found) sUpdated += 1;
  else sCreated += 1;
}

if (!dryRun) console.log(`Centres : ${created} créé(s), ${updated} mis à jour, ${geocoded} géocodé(s). Services : ${sCreated} créé(s), ${sUpdated} mis à jour.`);

// --- helpers -----------------------------------------------------------------
function loadEnv() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) fail(new Error(".env.local introuvable"));
  const env = Object.fromEntries(
    fs
      .readFileSync(p, "utf8")
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
  );
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) fail(new Error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis dans .env.local"));
  return env;
}

/** CSV minimal : guillemets doubles, séparateur ; ou , (détecté sur l'en-tête), BOM toléré. */
function parseCsv(raw) {
  const src = raw.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/)[0] ?? "";
  const sep = (firstLine.match(/;/g) ?? []).length >= (firstLine.match(/,/g) ?? []).length ? ";" : ",";
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_"));
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

function slugify(s) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
function text(v, max) {
  const s = (v ?? "").trim();
  return s ? s.slice(0, max) : null;
}
function num(v) {
  const s = (v ?? "").trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function bool(v, dflt) {
  const s = (v ?? "").trim().toLowerCase();
  if (!s) return dflt;
  return !["0", "false", "non", "no", "n", "inactif"].includes(s);
}
async function geocode(q, postcode) {
  try {
    const url = new URL("https://api-adresse.data.gouv.fr/search/");
    url.searchParams.set("q", q);
    url.searchParams.set("limit", "1");
    if (postcode) url.searchParams.set("postcode", postcode);
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const f = json.features?.[0];
    if (!f || (f.properties?.score ?? 0) < 0.4) return null;
    return f.geometry.coordinates; // [lng, lat]
  } catch {
    return null;
  }
}
function fail(e) {
  console.error(e.message ?? e);
  process.exit(1);
}
