#!/usr/bin/env node
/**
 * Prépare le logo ATLAS pour l'interface :
 *   - fond noir → transparent (la luminance devient le canal alpha) ;
 *   - rognage des marges ;
 *   - deux sorties : public/logo-atlas.png (1200 px, en-têtes et connexion)
 *                    public/logo-atlas-512.png (icône PWA / stores, carré).
 *
 *   node scripts/prepare-logo.mjs [chemin/vers/logo-source.png]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const src = process.argv[2] ?? path.join(process.cwd(), "public", "logo-atlas.png");
if (!fs.existsSync(src)) {
  console.error(`Fichier introuvable : ${src}`);
  process.exit(1);
}

const input = await sharp(src).ensureAlpha().toBuffer();
const { width, height } = await sharp(input).metadata();

// Luminance → alpha : le blanc du logo reste opaque, le fond noir devient transparent.
const alpha = await sharp(input).greyscale().linear(1.15, -10).toColourspace("b-w").raw().toBuffer();
const white = await sharp({ create: { width, height, channels: 3, background: "#ffffff" } }).raw().toBuffer();

const transparent = await sharp(white, { raw: { width, height, channels: 3 } })
  .joinChannel(alpha, { raw: { width, height, channels: 1 } })
  .png()
  .toBuffer();

// Rognage des marges transparentes puis exports
const trimmed = await sharp(transparent).trim({ threshold: 8 }).toBuffer();
const outWide = path.join(process.cwd(), "public", "logo-atlas.png");
const outSquare = path.join(process.cwd(), "public", "logo-atlas-512.png");

const wide = await sharp(trimmed).resize({ width: 1200, withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
fs.writeFileSync(outWide, wide);

const square = await sharp(trimmed)
  .resize({ width: 400, height: 400, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .extend({ top: 56, bottom: 56, left: 56, right: 56, background: "#0a0a0c" })
  .png()
  .toBuffer();
fs.writeFileSync(outSquare, square);

const m = await sharp(wide).metadata();
console.log(`logo-atlas.png : ${m.width}×${m.height}, ${Math.round(wide.length / 1024)} Ko`);
console.log(`logo-atlas-512.png : 512×512, ${Math.round(square.length / 1024)} Ko`);
