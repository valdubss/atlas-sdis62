"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import Link from "next/link";
import { CloudSun, LocateFixed, Phone, Plane, RefreshCw } from "lucide-react";
import type { DirectoryCenter } from "@/lib/centres/directory-types";
import { CENTER_TYPE_LABELS } from "@/lib/config";
import { telHref } from "@/lib/geo/maps";
import { droneVerdict, windCardinal } from "@/lib/carte/drone";
import { VIGILANCE_HEX, type CenterWeather, type LiveLayers } from "@/lib/carte/live";
import { aqiLabel, DRONE_WMS, fireColor, groupingColor, modeMemory, type MapMode } from "@/lib/carte/layers";
import { CenterSheetCompact } from "./CompactSheets";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";

/** Tuiles vectorielles OpenFreeMap : gratuites, sans clé, sans traçage. Changer l'URL pour un hébergement SDIS. */
export const MAP_STYLE = "https://tiles.openfreemap.org/styles/dark";
/** Pas-de-Calais */
const DEFAULT_BOUNDS: [[number, number], [number, number]] = [
  [1.55, 50.0],
  [3.2, 51.05],
];

type Located = DirectoryCenter & { lat: number; lng: number };

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}
const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—");
const verdictColor = (level: "go" | "caution" | "nogo") => (level === "go" ? "#5dbe7a" : level === "caution" ? "#e5c93c" : "#e4213a");
const verdictOf = (w: CenterWeather) => droneVerdict({ wind10: w.wind10, gust10: w.gust10, wind80: w.wind80, wind120: w.wind120, visibility: w.visibility, precipitation: w.precipitation, cloudCover: w.cloud_cover, isDay: w.is_day });

/**
 * Carte des centres (MapLibre GL + OpenFreeMap) : les trois groupements tracés,
 * marqueurs blancs, le rattachement en rouge, tap → fiche compacte. Trois modes :
 * Carte, Météo (vue départementale : vigilance, tendance, mer, cours d'eau) et
 * Drone (restrictions IGN + conditions de vol par centre). « Autour de moi »
 * demande la position à l'agent, jamais par défaut.
 */
export function DirectoryMap({ centers, homeCenterId }: { centers: DirectoryCenter[]; homeCenterId: string | null }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const libRef = useRef<typeof maplibregl | null>(null);
  const chipMarkers = useRef<maplibregl.Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<DirectoryCenter | null>(null);
  const [nearest, setNearest] = useState<(Located & { km: number })[] | null>(null);
  const [locating, setLocating] = useState(false);
  const [mode, setMode] = useState<MapMode>("carte");
  const [live, setLive] = useState<LiveLayers | null>(null);
  const [loading, setLoading] = useState(false);
  const [groupNames, setGroupNames] = useState<string[]>([]);
  const toast = useToast();
  const located = useMemo(() => centers.filter((c): c is Located => c.lat != null && c.lng != null), [centers]);
  const weatherOf = useMemo(() => new Map((live?.weather ?? []).map((w) => [w.center_id, w])), [live]);

  useEffect(() => setMode(modeMemory.read()), []);
  useEffect(() => modeMemory.write(mode), [mode]);

  // ---- Carte -------------------------------------------------------------------
  useEffect(() => {
    let map: maplibregl.Map | null = null;
    let cancelled = false;
    (async () => {
      const lib = await import("maplibre-gl");
      if (cancelled || !container.current) return;
      libRef.current = lib;
      map = new lib.Map({ container: container.current, style: MAP_STYLE, bounds: DEFAULT_BOUNDS, fitBoundsOptions: { padding: 24 }, attributionControl: { compact: true }, cooperativeGestures: false });
      map.addControl(new lib.NavigationControl({ showCompass: false }), "top-right");
      map.on("error", () => setFailed(true));
      // Le conteneur peut être mesuré avant sa mise en page : on recalcule la taille du canevas
      const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => map?.resize()) : null;
      ro?.observe(container.current);
      map.on("load", () => {
        if (cancelled) return;
        setReady(true);
        map!.resize();
        setTimeout(() => map?.resize(), 300);
        for (const c of located) {
          const el = document.createElement("button");
          el.type = "button";
          el.className = cn("atlas-marker", c.id === homeCenterId && "atlas-marker-home");
          el.setAttribute("aria-label", c.id === homeCenterId ? `${c.name} (mon centre)` : c.name);
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            setOpen(c);
          });
          new lib.Marker({ element: el, anchor: "center" }).setLngLat([c.lng, c.lat]).addTo(map!);
        }
        if (located.length > 0) {
          const b = new lib.LngLatBounds();
          for (const c of located) b.extend([c.lng, c.lat]);
          map!.fitBounds(b, { padding: 48, maxZoom: 12, duration: 0 });
        }
        // Groupements : polygones versionnés (public/geo/groupements.json)
        map!.addSource("groupements", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        const before = firstSymbolLayer(map!);
        map!.addLayer({ id: "groupements-fill", type: "fill", source: "groupements", paint: { "fill-color": ["to-color", ["get", "color"]], "fill-opacity": 0.12 } }, before);
        map!.addLayer({ id: "groupements-line", type: "line", source: "groupements", paint: { "line-color": ["to-color", ["get", "color"]], "line-width": 1.5, "line-opacity": 0.9 } }, before);
        map!.addLayer({ id: "groupements-label", type: "symbol", source: "groupements", layout: { "text-field": ["get", "name"], "text-size": 12, "text-font": ["Noto Sans Bold"], "text-allow-overlap": false }, paint: { "text-color": ["to-color", ["get", "color"]], "text-halo-color": "rgba(0,0,0,0.7)", "text-halo-width": 1.2 } });
        fetch("/geo/groupements.json")
          .then((r) => r.json())
          .then((geo: { features: { properties: { id: string; name: string } }[] }) => {
            setGroupNames(geo.features.map((f) => f.properties.name));
            (map!.getSource("groupements") as maplibregl.GeoJSONSource | undefined)?.setData({ ...geo, features: geo.features.map((f, i) => ({ ...f, properties: { ...f.properties, color: groupingColor(i) } })) } as unknown as GeoJSON.FeatureCollection);
          })
          .catch(() => {});
        // Restrictions drones (IGN) : ajoutée masquée, affichée par le mode drone
        map!.addSource("drone-wms", { type: "raster", tiles: [DRONE_WMS], tileSize: 256, attribution: "Restrictions UAS © IGN" });
        map!.addLayer({ id: "drone-wms", type: "raster", source: "drone-wms", layout: { visibility: "none" }, paint: { "raster-opacity": 0.55 } }, before);
      });
      mapRef.current = map;
    })();
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carte montée une fois
  }, []);

  // ---- Mode drone : couche IGN visible ---------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getLayer("drone-wms")) return;
    map.setLayoutProperty("drone-wms", "visibility", mode === "drone" ? "visible" : "none");
  }, [mode, ready]);

  // ---- Données live (météo et drone) ------------------------------------------------
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/carte/live", { credentials: "same-origin" });
      if (res.ok) setLive((await res.json()) as LiveLayers);
      else toast("Données météo indisponibles pour le moment.");
    } catch {
      toast("Données météo indisponibles hors ligne.");
    } finally {
      setLoading(false);
    }
  }, [toast]);
  useEffect(() => {
    if (mode === "carte") return;
    if (!live) void refresh();
    const t = setInterval(() => void refresh(), 10 * 60_000);
    return () => clearInterval(t);
  }, [mode, live, refresh]);

  // ---- Étiquettes de vol sous les centres (mode drone) ---------------------------------
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (!map || !lib || !ready) return;
    for (const m of chipMarkers.current) m.remove();
    chipMarkers.current = [];
    if (mode !== "drone" || !live) return;
    for (const c of located) {
      const w = weatherOf.get(c.id);
      if (!w) continue;
      const v = verdictOf(w);
      const el = document.createElement("span");
      el.className = "atlas-chip";
      el.innerHTML = `<i class="atlas-chip-dot" style="background:${verdictColor(v.level)}"></i>${Math.round(Math.max(w.wind10, w.wind80 ?? 0, w.wind120 ?? 0))} km/h`;
      chipMarkers.current.push(new lib.Marker({ element: el, anchor: "top" }).setLngLat([c.lng, c.lat]).addTo(map));
    }
  }, [live, mode, located, weatherOf, ready]);

  function locate() {
    if (!("geolocation" in navigator)) {
      toast("Localisation non disponible sur cet appareil.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLocating(false);
        const me = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const sorted = located.map((c) => ({ ...c, km: distanceKm(me, c) })).sort((a, b) => a.km - b.km);
        setNearest(sorted.slice(0, 3));
        const map = mapRef.current;
        const lib = libRef.current;
        if (map && lib) {
          const el = document.createElement("span");
          el.className = "atlas-marker-me";
          el.setAttribute("aria-label", "Ma position");
          new lib.Marker({ element: el, anchor: "center" }).setLngLat([me.lng, me.lat]).addTo(map);
          const b = new lib.LngLatBounds([me.lng, me.lat], [me.lng, me.lat]);
          for (const c of sorted.slice(0, 3)) b.extend([c.lng, c.lat]);
          map.fitBounds(b, { padding: 64, maxZoom: 13 });
        }
      },
      () => {
        setLocating(false);
        toast("Position refusée ou indisponible.");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  const MODES: { key: MapMode; label: string; icon?: typeof CloudSun }[] = [
    { key: "carte", label: "Carte" },
    { key: "meteo", label: "Météo", icon: CloudSun },
    { key: "drone", label: "Drone", icon: Plane },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div role="tablist" aria-label="Mode de la carte" className="flex flex-1 rounded-full bg-bg-1 p-1">
          {MODES.map((m) => (
            <button key={m.key} type="button" role="tab" aria-selected={mode === m.key} onClick={() => setMode(m.key)} className={cn("flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full text-[13px] font-medium", mode === m.key ? "bg-bg-2 text-text-1" : "text-text-2")}>
              {m.icon && <m.icon size={16} strokeWidth={1.75} aria-hidden="true" />}
              {m.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={locate} disabled={locating} aria-label="Autour de moi" className="pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-bg-1 text-text-1 disabled:opacity-60">
          <LocateFixed size={20} strokeWidth={1.75} aria-hidden="true" className={cn(locating && "animate-pulse")} />
        </button>
      </div>

      {mode === "meteo" && live?.vigilance && (
        <div className="flex items-center gap-3 rounded-[12px] bg-bg-1 px-4 py-2.5" role="status">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: VIGILANCE_HEX[live.vigilance.max] }} aria-hidden="true" />
          <span className="min-w-0 flex-1 text-[13px] text-text-1">
            Vigilance Météo-France <span className="font-semibold">{live.vigilance.max}</span> sur le Pas-de-Calais
            {live.vigilance.items.some((i) => i.color !== "vert") && <span className="text-text-2"> · {[...new Set(live.vigilance.items.filter((i) => i.color !== "vert").map((i) => `${i.phenomenon} (${i.color}${i.echeance === "J1" ? ", demain" : ""})`))].join(", ")}</span>}
          </span>
        </div>
      )}

      <div className="relative -mx-3 overflow-hidden bg-bg-1 sm:mx-0 sm:rounded-[16px]">
        <div ref={container} className="h-[min(62dvh,560px)] w-full" aria-label="Carte des centres" role="application" />
        {!ready && !failed && <p className="absolute inset-0 flex items-center justify-center text-[15px] text-text-2">Chargement de la carte…</p>}
        {failed && !ready && <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-[15px] text-text-2">Carte indisponible hors ligne. Les numéros restent accessibles depuis l&apos;annuaire.</p>}
        {groupNames.length > 0 && (
          <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5" aria-label="Légende">
            {groupNames.map((n, i) => (
              <span key={n} className="glass-float flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-text-1">
                <i className="h-2 w-2 rounded-full" style={{ background: groupingColor(i) }} aria-hidden="true" />
                {n.replace("Groupement ", "")}
              </span>
            ))}
            {homeCenterId && (
              <span className="glass-float flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-text-1">
                <i className="h-2 w-2 rounded-full bg-red" aria-hidden="true" /> Mon centre
              </span>
            )}
          </div>
        )}
      </div>

      {!homeCenterId && (
        <p className="px-1 text-[13px] text-text-3">
          Votre centre apparaîtra en rouge une fois votre rattachement choisi dans{" "}
          <Link href="/profil/centre" className="text-text-2 underline">
            Profil → Mon centre
          </Link>
          .
        </p>
      )}

      {mode !== "carte" && (
        <p className="flex items-center gap-2 px-1 text-[12px] text-text-4">
          {live ? `Mis à jour à ${hhmm(live.generated_at)} · Météo-France, Open-Meteo, Hub'Eau${mode === "drone" ? ", IGN" : ""}` : "Chargement des données…"}
          <button type="button" onClick={() => void refresh()} disabled={loading} aria-label="Actualiser" className="flex h-7 w-7 items-center justify-center rounded-full text-text-3 hover:text-text-1 disabled:opacity-50">
            <RefreshCw size={14} strokeWidth={1.75} className={cn(loading && "animate-spin")} />
          </button>
        </p>
      )}

      {mode === "meteo" && live && <DepartmentWeather live={live} />}
      {mode === "drone" && live && <DronePanel located={located} weatherOf={weatherOf} onPick={setOpen} />}

      {located.length === 0 && <p className="px-1 text-[13px] text-text-3">Aucun centre géolocalisé pour le moment : renseignez les adresses dans le Studio ou lancez l&apos;import CSV (géocodage automatique).</p>}
      {nearest && (
        <section className="space-y-2">
          <h2 className="px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-text-3">Les plus proches</h2>
          <ul className="hairline rounded-[16px] bg-bg-1">
            {nearest.map((c) => (
              <li key={c.id} className="flex items-center">
                <button type="button" onClick={() => setOpen(c)} className="pressable flex min-h-[56px] min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-text-1">{c.name}</span>
                    <span className="block truncate text-[13px] text-text-3">
                      {c.km < 1 ? `${Math.round(c.km * 1000)} m` : `${c.km.toFixed(c.km < 10 ? 1 : 0)} km`} · {[CENTER_TYPE_LABELS[c.type], c.city].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </button>
                {c.phone && (
                  <a href={telHref(c.phone)} aria-label={`Appeler ${c.name}`} className="pressable mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg-2 text-text-1">
                    <Phone size={18} strokeWidth={1.75} />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <CenterSheetCompact center={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function firstSymbolLayer(map: maplibregl.Map): string | undefined {
  return map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
}

/** Météo du département : synthèse des points (pas de détail par centre), mer, cours d'eau. */
function DepartmentWeather({ live }: { live: LiveLayers }) {
  const w = live.weather;
  if (w.length === 0) return <p className="px-1 text-[13px] text-text-3">Météo indisponible pour le moment.</p>;
  const temps = w.map((x) => x.temperature);
  const wind = w.map((x) => x.wind10);
  const gusts = w.map((x) => x.gust10);
  const rain = w.filter((x) => x.precipitation >= 0.2).length;
  const vis = w.map((x) => x.visibility).filter((v): v is number => v !== null);
  const worstAqi = w.reduce<number | null>((m, x) => (x.aqi !== null && (m === null || x.aqi > m) ? x.aqi : m), null);
  const fire = w.reduce((m, x) => (["faible", "modéré", "élevé", "très élevé"].indexOf(x.fire_level) > ["faible", "modéré", "élevé", "très élevé"].indexOf(m) ? x.fire_level : m), "faible" as CenterWeather["fire_level"]);
  const dir = windCardinal(w.reduce((s, x) => s + x.wind_dir, 0) / w.length);
  const rising = live.rivers.filter((r) => r.trend === "hausse");
  const sea = live.sea;
  const tiles: [string, string, string][] = [
    ["Température", `${Math.round(Math.min(...temps))} à ${Math.round(Math.max(...temps))} °C`, `humidité ${Math.round(w.reduce((s, x) => s + x.humidity, 0) / w.length)} %`],
    ["Vent", `${Math.round(Math.min(...wind))} à ${Math.round(Math.max(...wind))} km/h ${dir}`, `rafales jusqu'à ${Math.round(Math.max(...gusts))} km/h`],
    ["Pluie", rain === 0 ? "aucune en cours" : `sur ${rain} secteur${rain > 1 ? "s" : ""} sur ${w.length}`, vis.length ? `visibilité min. ${(Math.min(...vis) / 1000).toFixed(1)} km` : ""],
    ["Feu de végétation", fire, "indice d'Angström (estimation)"],
    ["Qualité de l'air", aqiLabel(worstAqi), worstAqi !== null ? `indice européen ${Math.round(worstAqi)} au pire` : ""],
    ["Cours d'eau", rising.length === 0 ? "stables ou en baisse" : `${rising.length} en hausse`, rising.length ? rising.slice(0, 3).map((r) => r.river ?? r.name).join(", ") : `${live.rivers.length} stations suivies`],
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map(([label, value, hint]) => (
          <div key={label} className="rounded-[16px] bg-bg-1 px-4 py-3">
            <p className="text-[12px] text-text-3">{label}</p>
            <p className="mt-0.5 text-[17px] font-semibold tracking-[-0.02em] text-text-1" style={label === "Feu de végétation" ? { color: fireColor(fire) } : undefined}>
              {value}
            </p>
            {hint && <p className="text-[12px] text-text-4">{hint}</p>}
          </div>
        ))}
      </div>
      {sea.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-text-3">Littoral</h2>
          <ul className="hairline rounded-[16px] bg-bg-1">
            {sea.map((s) => (
              <li key={s.name} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] text-text-1">{s.name}</span>
                  <span className="block text-[13px] text-text-3">
                    houle {s.wave_height !== null ? `${s.wave_height.toFixed(1)} m` : "—"} · pleine mer {hhmm(s.next_high)} · basse mer {hhmm(s.next_low)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="px-1 text-[12px] text-text-4">Synthèse sur les {w.length} points du département (un par centre), sans détail par centre.</p>
    </div>
  );
}

/** Mode drone : conditions de vol par centre, triées du plus favorable au plus défavorable. */
function DronePanel({ located, weatherOf, onPick }: { located: Located[]; weatherOf: Map<string, CenterWeather>; onPick: (c: Located) => void }) {
  const rows = located
    .map((c) => ({ c, w: weatherOf.get(c.id) }))
    .filter((x): x is { c: Located; w: CenterWeather } => Boolean(x.w))
    .map(({ c, w }) => ({ c, w, v: verdictOf(w) }))
    .sort((a, b) => (a.v.level === b.v.level ? a.c.name.localeCompare(b.c.name, "fr") : a.v.level === "go" ? -1 : b.v.level === "go" ? 1 : a.v.level === "caution" ? -1 : 1));
  const first = rows[0]?.w;
  return (
    <section className="space-y-2">
      {first && (
        <p className="px-1 text-[13px] text-text-2">
          Lever {hhmm(first.sunrise)} · coucher {hhmm(first.sunset)} · vent en altitude jusqu&apos;à {Math.round(Math.max(...rows.map((r) => Math.max(r.w.wind80 ?? 0, r.w.wind120 ?? 0))))} km/h à 120 m
        </p>
      )}
      <h2 className="px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-text-3">Conditions de vol par centre</h2>
      <ul className="hairline rounded-[16px] bg-bg-1">
        {rows.map(({ c, w, v }) => (
          <li key={c.id}>
            <button type="button" onClick={() => onPick(c)} className="pressable flex w-full items-center gap-3 px-4 py-2.5 text-left">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: verdictColor(v.level) }} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] text-text-1">{c.name}</span>
                <span className="block truncate text-[13px] text-text-3">
                  {v.label}
                  {v.reasons.length > 0 && ` · ${v.reasons.join(", ")}`}
                </span>
              </span>
              <span className="shrink-0 text-[13px] tabular-nums text-text-2">
                {Math.round(w.wind10)}
                <span className="text-text-4">/{Math.round(w.gust10)}</span> km/h
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="px-1 text-[12px] text-text-4">Seuils indicatifs catégorie ouverte : prudence dès 36 km/h, refus à 43 km/h de vent moyen (10, 80 ou 120 m) ou 54 km/h de rafales, pluie, visibilité sous 1,5 km. Zones colorées : restrictions UAS de l&apos;IGN, hors interdictions temporaires (vérifiez les NOTAM avant tout vol).</p>
    </section>
  );
}
