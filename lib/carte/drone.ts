/**
 * Vue télépilote : seuils de vol et indice feu (Angström), calculés côté
 * client à partir des données Open-Meteo par centre. Les seuils sont ceux
 * couramment retenus pour les drones de catégorie ouverte (adaptables).
 */

export const DRONE_LIMITS = {
  /** Vent moyen au-delà duquel le vol est déconseillé (km/h) */
  windCaution: 36,
  /** Vent moyen au-delà duquel le vol est refusé (km/h, ≈ 12 m/s) */
  windNoGo: 43,
  /** Rafales max acceptables (km/h) */
  gustNoGo: 54,
  /** Visibilité minimale (m) pour garder le drone en vue */
  visibilityMin: 1500,
  /** Pluie en cours (mm sur l'heure) au-delà de laquelle on ne vole pas */
  rainNoGo: 0.5,
} as const;

export type DroneWeather = {
  wind10: number;
  gust10: number;
  wind80?: number | null;
  wind120?: number | null;
  visibility: number | null;
  precipitation: number;
  cloudCover: number | null;
  isDay: boolean;
};

export type DroneVerdict = { level: "go" | "caution" | "nogo"; label: string; reasons: string[] };

/** Verdict vol : refusé, prudence ou favorable, avec les raisons. */
export function droneVerdict(w: DroneWeather): DroneVerdict {
  const reasons: string[] = [];
  let level: DroneVerdict["level"] = "go";
  const bump = (l: DroneVerdict["level"]) => {
    if (l === "nogo") level = "nogo";
    else if (l === "caution" && level === "go") level = "caution";
  };
  const windAloft = Math.max(w.wind80 ?? 0, w.wind120 ?? 0);
  if (w.wind10 >= DRONE_LIMITS.windNoGo || windAloft >= DRONE_LIMITS.windNoGo) {
    bump("nogo");
    reasons.push(`vent ${Math.round(Math.max(w.wind10, windAloft))} km/h`);
  } else if (w.wind10 >= DRONE_LIMITS.windCaution || windAloft >= DRONE_LIMITS.windCaution) {
    bump("caution");
    reasons.push(`vent soutenu ${Math.round(Math.max(w.wind10, windAloft))} km/h`);
  }
  if (w.gust10 >= DRONE_LIMITS.gustNoGo) {
    bump("nogo");
    reasons.push(`rafales ${Math.round(w.gust10)} km/h`);
  } else if (w.gust10 >= DRONE_LIMITS.windCaution) {
    bump("caution");
    reasons.push(`rafales ${Math.round(w.gust10)} km/h`);
  }
  if (w.precipitation >= DRONE_LIMITS.rainNoGo) {
    bump("nogo");
    reasons.push("pluie");
  }
  if (w.visibility !== null && w.visibility < DRONE_LIMITS.visibilityMin) {
    bump("nogo");
    reasons.push(`visibilité ${Math.round(w.visibility)} m`);
  } else if (w.visibility !== null && w.visibility < 3000) {
    bump("caution");
    reasons.push("visibilité réduite");
  }
  if (!w.isDay) {
    bump("caution");
    reasons.push("nuit : vol de nuit soumis à conditions");
  }
  const label = level === "go" ? "Vol favorable" : level === "caution" ? "Vol avec prudence" : "Vol déconseillé";
  return { level, label, reasons };
}

/**
 * Indice d'Angström (estimation du risque feu de végétation) :
 * I = HR/20 + (27 − T)/10 ; < 2,5 = risque élevé, < 2 = très élevé, > 4 = faible.
 */
export function angstrom(temperatureC: number, humidityPct: number): { index: number; level: "faible" | "modéré" | "élevé" | "très élevé" } {
  const index = humidityPct / 20 + (27 - temperatureC) / 10;
  const level = index < 2 ? "très élevé" : index < 2.5 ? "élevé" : index < 4 ? "modéré" : "faible";
  return { index: Math.round(index * 10) / 10, level };
}

/** Direction du vent en point cardinal. */
export function windCardinal(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

/** Tendance d'une hauteur d'eau : comparaison sur ~6 h. */
export function trend(latest: number | null, earlier: number | null, thresholdM = 0.03): "hausse" | "baisse" | "stable" | "inconnue" {
  if (latest === null || earlier === null) return "inconnue";
  const d = latest - earlier;
  return d > thresholdM ? "hausse" : d < -thresholdM ? "baisse" : "stable";
}
