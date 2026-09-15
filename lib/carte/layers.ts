/** Couches de la carte : définitions, groupes du menu, mémoire sur l'appareil. */

export type LayerKey = "groupements" | "vigilance" | "meteo" | "air" | "feu" | "crues" | "mer" | "trafic" | "drone";

export type LayerDef = { key: LayerKey; label: string; hint: string; live: boolean };

export const LAYER_GROUPS: { title: string; layers: LayerDef[] }[] = [
  { title: "Référentiel", layers: [{ key: "groupements", label: "Groupements territoriaux", hint: "Est, Centre, Ouest (approximation par proximité des CIS)", live: false }] },
  {
    title: "Météo",
    layers: [
      { key: "vigilance", label: "Vigilance Météo-France", hint: "Niveau du département par phénomène (bandeau)", live: true },
      { key: "meteo", label: "Météo par centre", hint: "Température, vent et rafales sur chaque CIS", live: true },
      { key: "air", label: "Qualité de l'air", hint: "Indice européen, PM10, ozone par centre", live: true },
      { key: "feu", label: "Indice feu de végétation", hint: "Indice d'Angström estimé (température, humidité)", live: true },
    ],
  },
  {
    title: "Eau",
    layers: [
      { key: "crues", label: "Cours d'eau", hint: "Hauteurs Hub'Eau et tendance sur 6 h", live: true },
      { key: "mer", label: "Mer et marées", hint: "Houle et prochaines marées sur le littoral", live: true },
    ],
  },
  { title: "Routes", layers: [{ key: "trafic", label: "Trafic", hint: "Événements Bison Futé (abonnement à configurer)", live: true }] },
  { title: "Télépilotes", layers: [{ key: "drone", label: "Vue drone", hint: "Zones de restriction (IGN) et conditions de vol par centre", live: true }] },
];

export const DEFAULT_LAYERS: Record<LayerKey, boolean> = { groupements: true, vigilance: true, meteo: false, air: false, feu: false, crues: false, mer: false, trafic: false, drone: false };

const KEY = "atlas:carte:couches:v1";

export const layerMemory = {
  read(): Record<LayerKey, boolean> {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
      return v && typeof v === "object" ? { ...DEFAULT_LAYERS, ...v } : DEFAULT_LAYERS;
    } catch {
      return DEFAULT_LAYERS;
    }
  },
  write(v: Record<LayerKey, boolean>) {
    try {
      localStorage.setItem(KEY, JSON.stringify(v));
    } catch {}
  },
};

/** Couleurs des trois groupements (sobres, distinctes dans les deux thèmes). */
export const GROUPING_COLORS = ["#6b8cd6", "#5dbe7a", "#e0a72e", "#b58cd6", "#d66b8c"];

export function groupingColor(index: number): string {
  return GROUPING_COLORS[index % GROUPING_COLORS.length];
}

/** Couleur d'un indice européen de qualité de l'air (0–100+). */
export function aqiColor(aqi: number | null): string {
  if (aqi === null) return "#8a8a90";
  if (aqi <= 20) return "#5dbe7a";
  if (aqi <= 40) return "#a5c94c";
  if (aqi <= 60) return "#e5c93c";
  if (aqi <= 80) return "#f08a24";
  return "#e4213a";
}

export function aqiLabel(aqi: number | null): string {
  if (aqi === null) return "inconnue";
  if (aqi <= 20) return "bonne";
  if (aqi <= 40) return "correcte";
  if (aqi <= 60) return "moyenne";
  if (aqi <= 80) return "dégradée";
  return "mauvaise";
}

export function fireColor(level: string): string {
  return level === "très élevé" ? "#e4213a" : level === "élevé" ? "#f08a24" : level === "modéré" ? "#e5c93c" : "#5dbe7a";
}

/** Service WMS IGN (Géoplateforme) : restrictions drones catégorie ouverte, sans clé. */
export const DRONE_WMS = "https://data.geopf.fr/wms-r/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=TRANSPORTS.DRONES.RESTRICTIONS&STYLES=&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=true";
