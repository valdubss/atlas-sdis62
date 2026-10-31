// Génère le logo « MySDIS by ATLAS » : mot MySDIS en Inter (Google Fonts, via Playwright), ligne
// « BY » + marque ATLAS (scripts/atlas-wordmark.png), blanc sur fond transparent.
// Sorties : public/logo-atlas.png (1200 px, complet), public/logo-mysdis.png (mot seul, pour les
// petites barres), public/logo-atlas-512.png et public/icons/*.
// Usage : node scripts/make-logo.mjs (reporter le ratio affiché dans components/brand/Logo.tsx).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const project = process.cwd();
const wordmarkFile = path.join(project, "scripts", "atlas-wordmark.png");

// 1. Marque ATLAS seule (scripts/atlas-wordmark.png, recadrée depuis l'ancien logo)
const wordmark = fs.readFileSync(wordmarkFile);
const wm = await sharp(wordmark).metadata();
const wordmarkB64 = wordmark.toString("base64");

// 2. Composition HTML (Inter via Google Fonts), capture en PNG transparent
const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;800&display=swap" rel="stylesheet">
<style>
  html, body { margin: 0; background: transparent; }
  #logo { display: inline-flex; flex-direction: column; align-items: center; padding: 40px; color: #fff; font-family: Inter, system-ui, sans-serif; }
  .word { font-size: 260px; line-height: 1; letter-spacing: -0.045em; white-space: nowrap; }
  .word .my { font-weight: 500; }
  .word .sdis { font-weight: 800; }
  .by { display: flex; align-items: center; gap: 26px; margin-top: 30px; }
  .by span { font-size: 54px; font-weight: 500; letter-spacing: 0.32em; line-height: 1; padding-left: 0.32em; }
  .by img { height: 62px; width: auto; display: block; }
</style></head><body>
<div id="logo">
  <div class="word"><span class="my">My</span><span class="sdis">SDIS</span></div>
  <div class="by"><span>BY</span><img src="data:image/png;base64,${wordmarkB64}" alt=""></div>
</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 1600, height: 800 } });
await page.setContent(html, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
const shot = await page.locator("#logo").screenshot({ omitBackground: true, type: "png" });
const wordShot = await page.locator("#logo .word").screenshot({ omitBackground: true, type: "png" });
await browser.close();

// 3. Exports : logo large 1200 px, carré 512, icônes
const trimmed = await sharp(shot).trim({ threshold: 8 }).png().toBuffer();
const wide = await sharp(trimmed).resize({ width: 1200, withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
fs.writeFileSync(path.join(project, "public", "logo-atlas.png"), wide);
const wideMeta = await sharp(wide).metadata();
const wordOnly = await sharp(wordShot).trim({ threshold: 8 }).resize({ width: 1200, withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
fs.writeFileSync(path.join(project, "public", "logo-mysdis.png"), wordOnly);
const wordMeta = await sharp(wordOnly).metadata();

async function square(size, logoWidth) {
  const logo = await sharp(trimmed).resize({ width: logoWidth, height: logoWidth, fit: "inside" }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: "#0a0a0c" } })
    .composite([{ input: logo, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}
const sq512 = await square(512, 400);
fs.writeFileSync(path.join(project, "public", "logo-atlas-512.png"), sq512);
fs.writeFileSync(path.join(project, "public", "icons", "icon-512.png"), sq512);
fs.writeFileSync(path.join(project, "public", "icons", "icon-192.png"), await sharp(sq512).resize(192).png().toBuffer());
fs.writeFileSync(path.join(project, "public", "icons", "apple-touch-icon.png"), await sharp(sq512).resize(180).png().toBuffer());
// Maskable : zone sûre = 80 % du carré, logo sur 300 px
fs.writeFileSync(path.join(project, "public", "icons", "icon-maskable-512.png"), await square(512, 300));
console.log(JSON.stringify({ full: [wideMeta.width, wideMeta.height], ratioFull: +(wideMeta.width / wideMeta.height).toFixed(3), word: [wordMeta.width, wordMeta.height], ratioWord: +(wordMeta.width / wordMeta.height).toFixed(3) }));
