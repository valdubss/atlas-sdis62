/** Modes de la carte : centres seuls, météo du département, vue télépilote. */
export type MapMode = "carte" | "meteo" | "drone";

const KEY = "atlas:carte:mode:v2";

export const modeMemory = {
  read(): MapMode {
    try {
      const v = localStorage.getItem(KEY);
      return v === "meteo" || v === "drone" ? v : "carte";
    } catch {
      return "carte";
    }
  },
  write(v: MapMode) {
    try {
      localStorage.setItem(KEY, v);
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
