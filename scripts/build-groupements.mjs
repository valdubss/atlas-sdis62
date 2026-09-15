#!/usr/bin/env node
/**
 * Tracé des groupements territoriaux (approximation par proximité).
 *
 *   npm run geo:groupements
 *
 * Chaque commune du Pas-de-Calais (contours geo.api.gouv.fr, licence ouverte)
 * est rattachée au CIS actif le plus proche ; les communes d'un même groupement
 * sont fusionnées en un polygone. Le résultat est écrit dans
 * public/geo/groupements.json (GeoJSON, ~200 Ko) et versionné : la carte le
 * charge sans appel réseau externe. Remplacer par les secteurs officiels du
 * SDIS dès qu'ils sont fournis (même format, propriété `name`).
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import * as turf from "@turf/turf";

const env = Object.fromEntries(
  fs
    .readFileSync(path.resolve(".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: centers, error } = await supabase.from("centers").select("id, name, lat, lng, type, grouping:groupings(id, name)").eq("is_active", true).eq("type", "cis");
if (error) throw error;
const cis = (centers ?? []).filter((c) => c.lat != null && c.lng != null && c.grouping);
if (cis.length === 0) throw new Error("Aucun CIS géolocalisé avec groupement.");
console.log(`${cis.length} CIS, ${new Set(cis.map((c) => c.grouping.id)).size} groupement(s)`);

const res = await fetch("https://geo.api.gouv.fr/communes?codeDepartement=62&format=geojson&geometry=contour&fields=code,nom");
if (!res.ok) throw new Error(`geo.api.gouv.fr ${res.status}`);
const communes = await res.json();
console.log(`${communes.features.length} communes`);

// Rattachement de chaque commune au CIS le plus proche de son centroïde
const byGrouping = new Map();
for (const f of communes.features) {
  const c = turf.centroid(f).geometry.coordinates;
  let best = null;
  let bestD = Infinity;
  for (const s of cis) {
    const d = turf.distance(c, [s.lng, s.lat]);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  const key = best.grouping.id;
  if (!byGrouping.has(key)) byGrouping.set(key, { name: best.grouping.name, features: [] });
  for (const poly of turf.flatten(f).features) byGrouping.get(key).features.push(turf.feature(poly.geometry, { g: key }));
}

// Fusion des communes par groupement (dissolve), simplification légère, ordre stable
const out = [];
for (const [id, g] of [...byGrouping.entries()].sort(([, a], [, b]) => a.name.localeCompare(b.name, "fr"))) {
  const dissolved = turf.dissolve(turf.featureCollection(g.features), { propertyName: "g" });
  // Un groupement peut donner plusieurs polygones (enclaves) : on les rassemble en MultiPolygon
  const polys = dissolved.features.map((f) => turf.simplify(f, { tolerance: 0.0006, highQuality: true }).geometry.coordinates);
  out.push(turf.multiPolygon(polys, { id, name: g.name, communes: g.features.length }));
  console.log(`${g.name}: ${g.features.length} communes, ${polys.length} polygone(s)`);
}

const target = path.resolve("public/geo/groupements.json");
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify({ type: "FeatureCollection", generated_at: new Date().toISOString(), method: "communes rattachées au CIS le plus proche (approximation)", features: out }));
console.log(`Écrit ${target} (${Math.round(fs.statSync(target).size / 1024)} Ko)`);
