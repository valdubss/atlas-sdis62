// Affiche l'URL du webhook Bunny Stream à coller dans la bibliothèque (API → Webhook URL),
// pour la production (.env.local) : le jeton est dérivé de la clé API, jamais la clé elle-même.
//   npm run bunny:webhook
import { createHash } from "node:crypto";
import fs from "node:fs";

const load = (f) => (fs.existsSync(f) ? Object.fromEntries(fs.readFileSync(f, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; })) : {});
const env = load(process.env.ENV_FILE ?? ".env.local");
if (!env.BUNNY_API_KEY) throw new Error("BUNNY_API_KEY manquant dans .env.local");
const token = createHash("sha256").update(`atlas-bunny-webhook:${env.BUNNY_API_KEY}`).digest("hex").slice(0, 40);
const site = (process.env.SITE_URL ?? "https://atlas-sdis62.vercel.app").replace(/\/$/, "");
console.log(`${site}/api/video/bunny?token=${token}`);
