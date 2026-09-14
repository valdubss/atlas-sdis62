#!/usr/bin/env node
/**
 * Extrait les couleurs dominantes du logo pour fixer les tokens de globals.css.
 *
 *   node scripts/extract-colors.mjs [chemin/vers/logo.png]
 *
 * Nécessite `sharp` (installé au lot c) : npm i -D sharp
 * Sortie : les 8 couleurs les plus présentes (hors blanc/transparent),
 * avec leur part en pourcentage et la teinte la plus proche (rouge / marine / gris).
 */
import { existsSync } from "node:fs";
import path from "node:path";

const file = process.argv[2] ?? path.join(process.cwd(), "public", "logo-sdis62.png");

if (!existsSync(file)) {
  console.error(`Logo introuvable : ${file}\nDéposez public/logo-sdis62.png puis relancez.`);
  process.exit(1);
}

let sharp;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.error("Le module `sharp` est requis : npm i -D sharp");
  process.exit(1);
}

const { data, info } = await sharp(file)
  .resize({ width: 300, withoutEnlargement: true })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const buckets = new Map();
const STEP = 12; // quantification par pas de 12 sur chaque canal
let counted = 0;

for (let i = 0; i < data.length; i += info.channels) {
  const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
  if (a < 128) continue;
  // Ignore le blanc et les gris très clairs (fond)
  if (r > 235 && g > 235 && b > 235) continue;
  const key = [r, g, b].map((v) => Math.round(v / STEP) * STEP).join(",");
  const cur = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
  cur.n++;
  cur.r += r;
  cur.g += g;
  cur.b += b;
  buckets.set(key, cur);
  counted++;
}

const hex = (v) => Math.round(v).toString(16).padStart(2, "0");
const label = (r, g, b) => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 25) return "gris/noir";
  if (r > g + 40 && r > b + 40) return "rouge";
  if (b > r + 20 && b >= g) return "marine/bleu";
  return "autre";
};

const top = [...buckets.values()]
  .sort((a, b) => b.n - a.n)
  .slice(0, 8)
  .map((c) => {
    const r = c.r / c.n;
    const g = c.g / c.n;
    const b = c.b / c.n;
    return {
      hex: `#${hex(r)}${hex(g)}${hex(b)}`,
      part: `${((c.n / counted) * 100).toFixed(1)} %`,
      teinte: label(r, g, b),
    };
  });

console.log(`Logo : ${file} (${info.width}×${info.height} après réduction)\n`);
console.table(top);
console.log(
  "\nReportez le rouge et le marine dominants dans app/globals.css (--red, --navy),\n" +
    "puis vérifiez les contrastes AA (texte blanc sur --red ≥ 4.5:1).",
);
