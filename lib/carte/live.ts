/** Couches « live » de la carte : formes partagées serveur / client. */

export type VigilanceColor = "vert" | "jaune" | "orange" | "rouge";
export type VigilanceItem = { phenomenon: string; color: VigilanceColor; echeance: "J" | "J1"; begin: string; end: string };
export type VigilanceLayer = { source: "meteofrance" | "opendatasoft"; updated_at: string | null; max: VigilanceColor; items: VigilanceItem[] };

export type CenterWeather = {
  center_id: string;
  at: string;
  temperature: number;
  humidity: number;
  wind10: number;
  gust10: number;
  wind_dir: number;
  wind80: number | null;
  wind120: number | null;
  precipitation: number;
  visibility: number | null;
  cloud_cover: number | null;
  is_day: boolean;
  sunrise: string | null;
  sunset: string | null;
  aqi: number | null;
  pm10: number | null;
  ozone: number | null;
  /** Indice d'Angström (estimation du risque feu de végétation) */
  fire_index: number;
  fire_level: "faible" | "modéré" | "élevé" | "très élevé";
};

export type RiverStation = { code: string; name: string; river: string | null; lat: number; lng: number; height_m: number | null; at: string | null; trend: "hausse" | "baisse" | "stable" | "inconnue" };

export type SeaPoint = { name: string; lat: number; lng: number; wave_height: number | null; wave_period: number | null; sea_level: number | null; next_high: string | null; next_low: string | null; wind_wave: number | null };

export type TrafficEvent = { id: string; lat: number; lng: number; road: string | null; kind: string; comment: string | null; severity: "info" | "modéré" | "fort"; updated_at: string | null };
export type TrafficLayer = { configured: boolean; source: string | null; updated_at: string | null; events: TrafficEvent[] };

/** Point du maillage météo (≈ 0,15°) couvrant le département. */
export type GridPoint = { i: number; lat: number; lng: number; temperature: number; humidity: number; wind10: number; gust10: number; wind_dir: number; precipitation: number; visibility: number | null; cloud_cover: number | null; is_day: boolean; weather_code: number | null };
/** Commune du département avec le point de maillage le plus proche. */
export type CommunePoint = { name: string; lat: number; lng: number; population: number; g: number };

export type LiveLayers = {
  generated_at: string;
  vigilance: VigilanceLayer | null;
  /** Maillage météo du département (base des vues zoomées) */
  grid: GridPoint[];
  /** Communes (chef-lieu) rattachées au point de maillage le plus proche */
  communes: CommunePoint[];
  weather: CenterWeather[];
  rivers: RiverStation[];
  sea: SeaPoint[];
  traffic: TrafficLayer;
  errors: string[];
};

export const VIGILANCE_ORDER: VigilanceColor[] = ["vert", "jaune", "orange", "rouge"];
export const VIGILANCE_HEX: Record<VigilanceColor, string> = { vert: "#5dbe7a", jaune: "#e5c93c", orange: "#f08a24", rouge: "#e4213a" };

/** Points côtiers suivis pour l'état de la mer et les marées. */
export const SEA_POINTS = [
  { name: "Calais", lat: 50.97, lng: 1.85 },
  { name: "Boulogne-sur-Mer", lat: 50.73, lng: 1.58 },
  { name: "Étaples / Le Touquet", lat: 50.52, lng: 1.58 },
  { name: "Berck-sur-Mer", lat: 50.4, lng: 1.55 },
] as const;
