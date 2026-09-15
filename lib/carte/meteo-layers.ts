/**
 * Couche météo de la carte : surface de température (cellules de Voronoï du
 * maillage), étiquettes condensées par groupement au dézoom, par point de
 * maillage aux zooms moyens, par commune au zoom fort. MapLibre masque
 * automatiquement les étiquettes qui se chevauchent.
 */
import type { Feature, FeatureCollection, Point, Polygon } from "geojson";
import { windCardinal } from "./drone";
import type { GridPoint, CommunePoint } from "./live";

export const METEO_LAYER_IDS = ["meteo-fill", "meteo-grouping-label", "meteo-grid-label", "meteo-commune-label"] as const;

/** Flèche « vers où va le vent » à partir de la direction d'origine (météo). */
export function windArrow(fromDeg: number): string {
  const arrows = ["↓", "↙", "←", "↖", "↑", "↗", "→", "↘"];
  return arrows[Math.round((((fromDeg % 360) + 360) % 360) / 45) % 8];
}

/** Libellé court des conditions (codes WMO Open-Meteo). */
export function weatherWord(code: number | null, precipitation: number): string {
  if (precipitation >= 0.2 || (code !== null && code >= 51)) return code !== null && code >= 95 ? "orage" : code !== null && code >= 71 && code <= 77 ? "neige" : "pluie";
  if (code === null) return "";
  if (code === 0) return "clair";
  if (code <= 2) return "éclaircies";
  if (code === 3) return "couvert";
  if (code <= 48) return "brouillard";
  return "";
}

/** Échelle de couleur de température (°C → couleur). */
export const TEMP_STOPS: [number, string][] = [
  [-5, "#5b7bd6"],
  [5, "#4fa3d6"],
  [12, "#5dbe7a"],
  [20, "#e5c93c"],
  [27, "#f08a24"],
  [34, "#e4213a"],
];

export function tempColor(t: number): string {
  if (t <= TEMP_STOPS[0][0]) return TEMP_STOPS[0][1];
  for (let i = 1; i < TEMP_STOPS.length; i++) {
    if (t <= TEMP_STOPS[i][0]) {
      const [t0, c0] = TEMP_STOPS[i - 1];
      const [t1, c1] = TEMP_STOPS[i];
      const k = (t - t0) / (t1 - t0);
      const p = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
      const a = p(c0), b = p(c1);
      return `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)}, ${Math.round(a[1] + (b[1] - a[1]) * k)}, ${Math.round(a[2] + (b[2] - a[2]) * k)})`;
    }
  }
  return TEMP_STOPS[TEMP_STOPS.length - 1][1];
}

type LabelProps = { label: string; sort: number; color: string };

/** Points du maillage → étiquettes « 18° 21 km/h ↗ ». */
export function gridLabels(grid: GridPoint[]): FeatureCollection<Point, LabelProps> {
  return {
    type: "FeatureCollection",
    features: grid.map((g) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [g.lng, g.lat] },
      properties: { label: `${Math.round(g.temperature)}°  ${Math.round(g.wind10)} km/h ${windArrow(g.wind_dir)}${g.precipitation >= 0.2 ? "  pluie" : ""}`, sort: 0, color: tempColor(g.temperature) },
    })),
  };
}

/** Communes → étiquettes détaillées, priorité aux plus peuplées (symbol-sort-key croissant). */
export function communeLabels(communes: CommunePoint[], grid: GridPoint[]): FeatureCollection<Point, LabelProps & { name: string; detail: string }> {
  return {
    type: "FeatureCollection",
    features: communes
      .filter((c) => grid[c.g])
      .map((c) => {
        const g = grid[c.g];
        const word = weatherWord(g.weather_code, g.precipitation);
        return {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [c.lng, c.lat] },
          properties: {
            name: c.name,
            label: `${c.name}\n${Math.round(g.temperature)}° · ${Math.round(g.wind10)} km/h ${windCardinal(g.wind_dir)} ${windArrow(g.wind_dir)}${word ? ` · ${word}` : ""}`,
            detail: `rafales ${Math.round(g.gust10)} km/h · humidité ${Math.round(g.humidity)} %`,
            sort: -c.population,
            color: tempColor(g.temperature),
          },
        };
      }),
  };
}

/** Synthèse par groupement (moyenne des points de maillage dans le polygone). */
export function groupingLabels(grid: GridPoint[], groupings: Feature<Polygon | import("geojson").MultiPolygon, { name: string }>[], inside: (pt: [number, number], poly: Feature<Polygon | import("geojson").MultiPolygon>) => boolean, centroid: (poly: Feature<Polygon | import("geojson").MultiPolygon>) => [number, number]): FeatureCollection<Point, LabelProps> {
  const features = groupings
    .map((poly) => {
      const pts = grid.filter((g) => inside([g.lng, g.lat], poly));
      if (pts.length === 0) return null;
      const avg = (f: (g: GridPoint) => number) => pts.reduce((s, g) => s + f(g), 0) / pts.length;
      const rain = pts.some((g) => g.precipitation >= 0.2);
      const t = avg((g) => g.temperature);
      const dir = avg((g) => g.wind_dir);
      return {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: centroid(poly) },
        properties: { label: `${poly.properties.name.replace("Groupement ", "")}\n${Math.round(t)}° · ${Math.round(avg((g) => g.wind10))} km/h ${windCardinal(dir)} ${windArrow(dir)}${rain ? " · pluie" : ""}`, sort: 0, color: tempColor(t) },
      };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);
  return { type: "FeatureCollection", features };
}
