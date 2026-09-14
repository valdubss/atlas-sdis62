#!/usr/bin/env node
/**
 * Captures d'écran de référence (DESIGN.md, méthode §3) : 390×844 et 1440×900.
 *
 *   node scripts/screenshots.mjs [http://localhost:3000]
 *
 * Nécessite .env.local (URL Supabase + clé service_role) : une session est
 * ouverte pour l'administrateur via un lien magique généré côté serveur, puis
 * les écrans sont capturés dans docs/screenshots/.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const root = process.cwd();
const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const out = path.join(root, "docs", "screenshots");
fs.mkdirSync(out, { recursive: true });

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(root, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const email = env.SCREENSHOT_EMAIL ?? (env.ALLOWED_EMAILS ?? "").split(",")[0]?.trim();
if (!email) throw new Error("Renseignez SCREENSHOT_EMAIL ou ALLOWED_EMAILS dans .env.local");

async function loginUrl() {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email }),
  });
  const data = await res.json();
  if (!data.hashed_token) throw new Error("Lien de connexion impossible : " + JSON.stringify(data));
  return `${base}/auth/callback?type=magiclink&token_hash=${data.hashed_token}`;
}

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844, mobile: true },
  { name: "desktop", width: 1440, height: 900, mobile: false },
];
const SCREENS = [
  { name: "login", path: "/login", auth: false },
  { name: "feed", path: "/", auth: true },
  { name: "profil", path: "/profil", auth: true },
  { name: "studio", path: "/studio", auth: true },
  { name: "studio-new", path: "/studio/posts/new", auth: true },
  { name: "dev-ui", path: "/studio/dev-ui", auth: true, full: true },
];

const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    colorScheme: "dark",
    locale: "fr-FR",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();

  // Connexion (cookies dans le contexte)
  await page.goto(await loginUrl(), { waitUntil: "networkidle" });

  for (const s of SCREENS) {
    if (!s.auth) {
      const anon = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, isMobile: vp.mobile, colorScheme: "dark", locale: "fr-FR" });
      const p = await anon.newPage();
      await p.goto(`${base}${s.path}`, { waitUntil: "networkidle" });
      await p.screenshot({ path: path.join(out, `${s.name}-${vp.name}.png`) });
      await anon.close();
      continue;
    }
    await page.goto(`${base}${s.path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(out, `${s.name}-${vp.name}.png`), fullPage: Boolean(s.full) });
  }
  await context.close();
}
await browser.close();
console.log(`Captures écrites dans ${out}`);
