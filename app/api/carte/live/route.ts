import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { angstrom, trend } from "@/lib/carte/drone";
import { SEA_POINTS, VIGILANCE_ORDER, type CenterWeather, type CommunePoint, type GridPoint, type LiveLayers, type RiverStation, type SeaPoint, type TrafficEvent, type TrafficLayer, type VigilanceColor, type VigilanceLayer } from "@/lib/carte/live";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TEN_MIN = { next: { revalidate: 600 } } as const;

// Délai maximal par fournisseur : un service lent ne bloque pas toute la réponse (Promise.all gardé)
const TIMEOUT_MS = 8_000;

async function getJson<T>(url: string, init?: RequestInit & { next?: { revalidate: number } }): Promise<T> {
  const res = await fetch(url, { ...TEN_MIN, signal: AbortSignal.timeout(TIMEOUT_MS), ...init });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return (await res.json()) as T;
}

// ---- Vigilance Météo-France (API officielle si clé, sinon relais open data) ----
async function vigilance(): Promise<VigilanceLayer> {
  const key = process.env.METEOFRANCE_API_KEY;
  if (key) {
    type MF = { product: { periods: { echeance: string; timelaps: { domain_ids: { domain_id: string; max_color_id: number; phenomenon_items: { phenomenon_id: string; phenomenon_max_color_id: number }[] }[] }[] }[]; update_time?: string } };
    const data = await getJson<MF>("https://public-api.meteofrance.fr/public/DPVigilance/v1/cartevigilance/encours", { ...TEN_MIN, headers: { apikey: key, accept: "application/json" } });
    const colors: VigilanceColor[] = ["vert", "vert", "jaune", "orange", "rouge"];
    const names: Record<string, string> = { "1": "vent", "2": "pluie-inondation", "3": "orages", "4": "crues", "5": "neige-verglas", "6": "canicule", "7": "grand froid", "8": "avalanches", "9": "vagues-submersion" };
    const items = data.product.periods.flatMap((p) =>
      p.timelaps.flatMap((t) =>
        t.domain_ids
          .filter((d) => d.domain_id === "62")
          .flatMap((d) => d.phenomenon_items.map((ph) => ({ phenomenon: names[ph.phenomenon_id] ?? ph.phenomenon_id, color: colors[ph.phenomenon_max_color_id] ?? "vert", echeance: (p.echeance === "J1" ? "J1" : "J") as "J" | "J1", begin: "", end: "" }))),
      ),
    );
    const max = items.reduce<VigilanceColor>((m, i) => (VIGILANCE_ORDER.indexOf(i.color) > VIGILANCE_ORDER.indexOf(m) ? i.color : m), "vert");
    return { source: "meteofrance", updated_at: data.product.update_time ?? null, max, items };
  }
  type ODS = { results: { phenomenon: string; color: string; echeance: string; begin_time: string; end_time: string; product_datetime: string }[] };
  const data = await getJson<ODS>("https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/weatherref-france-vigilance-meteo-departement/records?where=domain_id%3D%2262%22&limit=40");
  const norm = (c: string): VigilanceColor => (c === "rouge" ? "rouge" : c === "orange" ? "orange" : c === "jaune" ? "jaune" : "vert");
  const items = data.results.map((r) => ({ phenomenon: r.phenomenon, color: norm(r.color), echeance: (r.echeance === "J1" ? "J1" : "J") as "J" | "J1", begin: r.begin_time, end: r.end_time }));
  const max = items.reduce<VigilanceColor>((m, i) => (VIGILANCE_ORDER.indexOf(i.color) > VIGILANCE_ORDER.indexOf(m) ? i.color : m), "vert");
  return { source: "opendatasoft", updated_at: data.results[0]?.product_datetime ?? null, max, items };
}

// ---- Météo : maillage du département (Open-Meteo, un appel groupé), air par centre ----
const GRID_STEP = 0.15;
const GRID_BOUNDS = { minLat: 50.0, maxLat: 51.05, minLng: 1.55, maxLng: 3.2 };
function gridCoords(): { lat: number; lng: number }[] {
  const out: { lat: number; lng: number }[] = [];
  for (let lat = GRID_BOUNDS.minLat; lat <= GRID_BOUNDS.maxLat + 1e-9; lat += GRID_STEP) for (let lng = GRID_BOUNDS.minLng; lng <= GRID_BOUNDS.maxLng + 1e-9; lng += GRID_STEP) out.push({ lat: Math.round(lat * 1000) / 1000, lng: Math.round(lng * 1000) / 1000 });
  return out;
}
function nearestIndex(pts: { lat: number; lng: number }[], lat: number, lng: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const d = (pts[i].lat - lat) ** 2 + ((pts[i].lng - lng) * 0.64) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

type OM = { current: { time: string; temperature_2m: number; relative_humidity_2m: number; wind_speed_10m: number; wind_gusts_10m: number; wind_direction_10m: number; precipitation: number; visibility?: number; cloud_cover: number; is_day: number; weather_code?: number }; hourly: { time: string[]; wind_speed_80m: number[]; wind_speed_120m: number[] }; daily: { sunrise: string[]; sunset: string[] } };

async function grid(): Promise<{ grid: GridPoint[]; raw: OM[] }> {
  const pts = gridCoords();
  const lat = pts.map((c) => c.lat).join(",");
  const lng = pts.map((c) => c.lng).join(",");
  const wx = await getJson<OM | OM[]>(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation,visibility,cloud_cover,is_day,weather_code&hourly=wind_speed_80m,wind_speed_120m&daily=sunrise,sunset&forecast_days=1&timezone=Europe%2FParis`, { next: { revalidate: 900 } });
  const raw = Array.isArray(wx) ? wx : [wx];
  return {
    raw,
    grid: pts.map((p, i) => {
      const w = raw[i];
      return { i, lat: p.lat, lng: p.lng, temperature: w.current.temperature_2m, humidity: w.current.relative_humidity_2m, wind10: w.current.wind_speed_10m, gust10: w.current.wind_gusts_10m, wind_dir: w.current.wind_direction_10m, precipitation: w.current.precipitation, visibility: w.current.visibility ?? null, cloud_cover: w.current.cloud_cover ?? null, is_day: w.current.is_day === 1, weather_code: w.current.weather_code ?? null };
    }),
  };
}

/** Communes du département (geo.api.gouv.fr, cache 24 h) rattachées au point de maillage le plus proche. */
async function communes(pts: GridPoint[]): Promise<CommunePoint[]> {
  type C = { nom: string; centre: { coordinates: [number, number] }; population?: number };
  const list = await getJson<C[]>("https://geo.api.gouv.fr/communes?codeDepartement=62&fields=nom,centre,population&format=json", { next: { revalidate: 86_400 } });
  return list.map((c) => ({ name: c.nom, lat: c.centre.coordinates[1], lng: c.centre.coordinates[0], population: c.population ?? 0, g: nearestIndex(pts, c.centre.coordinates[1], c.centre.coordinates[0]) }));
}

/** Météo par centre dérivée du maillage (vent en altitude, soleil), qualité de l'air par centre. */
async function weather(centers: { id: string; lat: number; lng: number }[], pts: GridPoint[], raw: OM[]): Promise<CenterWeather[]> {
  if (centers.length === 0) return [];
  type AQ = { current: { european_aqi: number | null; pm10: number | null; ozone: number | null } };
  const aq = await getJson<AQ | AQ[]>(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${centers.map((c) => c.lat.toFixed(3)).join(",")}&longitude=${centers.map((c) => c.lng.toFixed(3)).join(",")}&current=european_aqi,pm10,ozone&timezone=Europe%2FParis`, { next: { revalidate: 1800 } }).catch(() => null);
  const aqList = aq ? (Array.isArray(aq) ? aq : [aq]) : [];
  return centers.map((c, i) => {
    const gi = nearestIndex(pts, c.lat, c.lng);
    const g = pts[gi];
    const w = raw[gi];
    const hourIdx = Math.max(0, w.hourly.time.findIndex((t) => t >= w.current.time.slice(0, 13)));
    const a = aqList[i];
    const fire = angstrom(g.temperature, g.humidity);
    return {
      center_id: c.id, at: w.current.time, temperature: g.temperature, humidity: g.humidity, wind10: g.wind10, gust10: g.gust10, wind_dir: g.wind_dir,
      wind80: w.hourly.wind_speed_80m?.[hourIdx] ?? null, wind120: w.hourly.wind_speed_120m?.[hourIdx] ?? null,
      precipitation: g.precipitation, visibility: g.visibility, cloud_cover: g.cloud_cover, is_day: g.is_day,
      sunrise: w.daily.sunrise?.[0] ?? null, sunset: w.daily.sunset?.[0] ?? null,
      aqi: a?.current.european_aqi ?? null, pm10: a?.current.pm10 ?? null, ozone: a?.current.ozone ?? null,
      fire_index: fire.index, fire_level: fire.level,
    };
  });
}

// ---- Cours d'eau : stations Hub'Eau du Pas-de-Calais, hauteur et tendance sur 6 h ----
async function rivers(): Promise<RiverStation[]> {
  type Stations = { data: { code_station: string; libelle_station: string; libelle_cours_eau: string | null; latitude_station: number; longitude_station: number; en_service: boolean }[] };
  const st = await getJson<Stations>("https://hubeau.eaufrance.fr/api/v2/hydrometrie/referentiel/stations?code_departement=62&format=json&size=200&fields=code_station,libelle_station,libelle_cours_eau,latitude_station,longitude_station,en_service", { next: { revalidate: 86_400 } });
  const active = st.data.filter((s) => s.en_service && s.latitude_station && s.longitude_station).slice(0, 60);
  type Obs = { data: { code_station: string; date_obs: string; resultat_obs: number }[] };
  const since = new Date(Date.now() - 7 * 3_600_000).toISOString();
  const obs = await getJson<Obs>(`https://hubeau.eaufrance.fr/api/v2/hydrometrie/observations_tr?code_entite=${active.map((s) => s.code_station).join(",")}&grandeur_hydro=H&date_debut_obs=${encodeURIComponent(since)}&size=20000&fields=code_station,date_obs,resultat_obs`).catch(() => ({ data: [] }) as Obs);
  const byStation = new Map<string, { date_obs: string; resultat_obs: number }[]>();
  for (const o of obs.data) byStation.set(o.code_station, [...(byStation.get(o.code_station) ?? []), o]);
  return active.map((s) => {
    const list = (byStation.get(s.code_station) ?? []).sort((a, b) => a.date_obs.localeCompare(b.date_obs));
    const latest = list[list.length - 1] ?? null;
    const sixHoursAgo = latest ? new Date(new Date(latest.date_obs).getTime() - 6 * 3_600_000).toISOString() : null;
    const earlier = sixHoursAgo ? [...list].reverse().find((o) => o.date_obs <= sixHoursAgo) ?? list[0] ?? null : null;
    return {
      code: s.code_station,
      name: s.libelle_station,
      river: s.libelle_cours_eau,
      lat: s.latitude_station,
      lng: s.longitude_station,
      height_m: latest ? Math.round(latest.resultat_obs) / 1000 : null,
      at: latest?.date_obs ?? null,
      trend: trend(latest ? latest.resultat_obs / 1000 : null, earlier ? earlier.resultat_obs / 1000 : null),
    };
  });
}

// ---- État de la mer et marées (Open-Meteo Marine) ----
async function sea(): Promise<SeaPoint[]> {
  const lat = SEA_POINTS.map((p) => p.lat).join(",");
  const lng = SEA_POINTS.map((p) => p.lng).join(",");
  type M = { current?: { wave_height: number | null; wave_period: number | null; wind_wave_height: number | null; sea_level_height_msl: number | null }; hourly: { time: string[]; sea_level_height_msl: (number | null)[] } };
  const data = await getJson<M | M[]>(`https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lng}&current=wave_height,wave_period,wind_wave_height,sea_level_height_msl&hourly=sea_level_height_msl&forecast_days=2&timezone=Europe%2FParis`);
  const list = Array.isArray(data) ? data : [data];
  const now = new Date();
  return SEA_POINTS.map((p, i) => {
    const m = list[i];
    const h = m.hourly.sea_level_height_msl ?? [];
    const t = m.hourly.time ?? [];
    let nextHigh: string | null = null;
    let nextLow: string | null = null;
    for (let k = 1; k < h.length - 1; k++) {
      if (new Date(t[k]) < now) continue;
      const a = h[k - 1], b = h[k], c = h[k + 1];
      if (a === null || b === null || c === null) continue;
      if (!nextHigh && b > a && b >= c) nextHigh = t[k];
      if (!nextLow && b < a && b <= c) nextLow = t[k];
      if (nextHigh && nextLow) break;
    }
    return { name: p.name, lat: p.lat, lng: p.lng, wave_height: m.current?.wave_height ?? null, wave_period: m.current?.wave_period ?? null, sea_level: m.current?.sea_level_height_msl ?? null, wind_wave: m.current?.wind_wave_height ?? null, next_high: nextHigh, next_low: nextLow };
  });
}

// ---- Trafic (flux DATEX II d'un abonnement Bison Futé, si configuré) ----
async function traffic(): Promise<TrafficLayer> {
  const url = process.env.TRAFIC_FEED_URL;
  if (!url) return { configured: false, source: null, updated_at: null, events: [] };
  const res = await fetch(url, { ...TEN_MIN, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`trafic ${res.status}`);
  const xml = await res.text();
  const events: TrafficEvent[] = [];
  const bbox = { minLat: 50.0, maxLat: 51.1, minLng: 1.5, maxLng: 3.25 };
  for (const m of xml.matchAll(/<situationRecord[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/situationRecord>/g)) {
    const body = m[2];
    const lat = Number(/<latitude>([^<]+)</.exec(body)?.[1]);
    const lng = Number(/<longitude>([^<]+)</.exec(body)?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < bbox.minLat || lat > bbox.maxLat || lng < bbox.minLng || lng > bbox.maxLng) continue;
    const kind = /xsi:type="([^"]+)"/.exec(m[0])?.[1] ?? "événement";
    const comment = /<comment>[\s\S]*?<value[^>]*>([^<]+)</.exec(body)?.[1] ?? null;
    const road = /<roadNumber>([^<]+)</.exec(body)?.[1] ?? null;
    const sev = /<severity>([^<]+)</.exec(body)?.[1] ?? "";
    events.push({ id: m[1], lat, lng, road, kind, comment, severity: /high|highest/.test(sev) ? "fort" : /medium/.test(sev) ? "modéré" : "info", updated_at: /<situationRecordVersionTime>([^<]+)</.exec(body)?.[1] ?? null });
  }
  return { configured: true, source: new URL(url).host, updated_at: /<publicationTime>([^<]+)</.exec(xml)?.[1] ?? null, events };
}

/** Toutes les couches en un appel (agents connectés), chaque flux mis en cache 10 min côté serveur. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "non connecté" }, { status: 401 });
  const { data: centers } = await supabase.from("centers").select("id, lat, lng").eq("is_active", true).not("lat", "is", null).not("lng", "is", null);
  const errors: string[] = [];
  const guard = async <T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      errors.push(`${label} : ${e instanceof Error ? e.message : String(e)}`);
      return fallback;
    }
  };
  const g = await guard("météo", grid, { grid: [] as GridPoint[], raw: [] as OM[] });
  const [vig, wx, com, riv, mer, tra] = await Promise.all([
    guard("vigilance", vigilance, null),
    g.grid.length ? guard("météo par centre", () => weather((centers ?? []) as { id: string; lat: number; lng: number }[], g.grid, g.raw), []) : Promise.resolve([] as CenterWeather[]),
    g.grid.length ? guard("communes", () => communes(g.grid), []) : Promise.resolve([] as CommunePoint[]),
    guard("cours d'eau", rivers, []),
    guard("mer", sea, []),
    guard("trafic", traffic, { configured: Boolean(process.env.TRAFIC_FEED_URL), source: null, updated_at: null, events: [] }),
  ]);
  const body: LiveLayers = { generated_at: new Date().toISOString(), vigilance: vig, grid: g.grid, communes: com, weather: wx, rivers: riv, sea: mer, traffic: tra, errors };
  return NextResponse.json(body, { headers: { "Cache-Control": "private, max-age=300" } });
}
