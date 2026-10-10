// Copie le worker de MapLibre dans public/vendor : l'empaquetage Next ne sert pas le fichier
// que MapLibre cherche à côté de son propre module (import.meta.url), la carte restait « hors ligne ».
// À relancer après une montée de version de maplibre-gl : `npm run vendor:maplibre`.
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
const version = JSON.parse(readFileSync("node_modules/maplibre-gl/package.json", "utf8")).version;
mkdirSync("public/vendor", { recursive: true });
copyFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "public/vendor/maplibre-gl-worker.mjs");
console.log(`maplibre-gl ${version} : worker copié dans public/vendor/maplibre-gl-worker.mjs`);
