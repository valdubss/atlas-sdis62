"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import Link from "next/link";
import { Layers, LocateFixed, Phone, RefreshCw } from "lucide-react";
import type { DirectoryCenter } from "@/lib/centres/directory-types";
import { CENTER_TYPE_LABELS } from "@/lib/config";
import { telHref } from "@/lib/geo/maps";
import { droneVerdict, windCardinal } from "@/lib/carte/drone";
import { VIGILANCE_HEX, type CenterWeather, type LiveLayers, type RiverStation, type SeaPoint, type TrafficEvent } from "@/lib/carte/live";
import { aqiColor, aqiLabel, DRONE_WMS, fireColor, groupingColor, LAYER_GROUPS, layerMemory, type LayerKey } from "@/lib/carte/layers";
import { CenterSheetCompact } from "./CompactSheets";
import { Sheet } from "@/components/ui/Sheet";
import { CheckboxField } from "@/components/ui/Field";
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
type Selected = { kind: "center"; c: Located } | { kind: "river"; r: RiverStation } | { kind: "sea"; s: SeaPoint } | { kind: "traffic"; t: TrafficEvent } | null;

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}
const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—");

/**
 * Carte des centres (MapLibre GL + OpenFreeMap) : marqueurs blancs, le
 * rattachement en rouge, tap → fiche compacte. Couches activables : groupements,
 * vigilance, météo, air, indice feu, cours d'eau, mer, trafic, vue drone.
 * « Autour de moi » demande la position à l'agent, jamais par défaut.
 */
export function DirectoryMap({ centers, homeCenterId }: { centers: DirectoryCenter[]; homeCenterId: string | null }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const libRef = useRef<typeof maplibregl | null>(null);
  const liveMarkers = useRef<maplibregl.Marker[]>([]);
  const chipMarkers = useRef<maplibregl.Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<DirectoryCenter | null>(null);
  const [selected, setSelected] = useState<Selected>(null);
  const [nearest, setNearest] = useState<(Located & { km: number })[] | null>(null);
  const [locating, setLocating] = useState(false);
  const [layers, setLayers] = useState(layerMemory.read);
  const [menu, setMenu] = useState(false);
  const [live, setLive] = useState<LiveLayers | null>(null);
  const [loading, setLoading] = useState(false);
  const [groupNames, setGroupNames] = useState<string[]>([]);
  const toast = useToast();
  const located = useMemo(() => centers.filter((c): c is Located => c.lat != null && c.lng != null), [centers]);
  const needLive = LAYER_GROUPS.some((g) => g.layers.some((l) => l.live && layers[l.key]));
  const weatherOf = useMemo(() => new Map((live?.weather ?? []).map((w) => [w.center_id, w])), [live]);

  useEffect(() => layerMemory.write(layers), [layers]);

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
            setSelected({ kind: "center", c });
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
        map!.addSource("groupements", { type: "geojson", data: "/geo/groupements.json" });
        map!.addLayer({ id: "groupements-fill", type: "fill", source: "groupements", paint: { "fill-color": ["to-color", ["get", "color"]], "fill-opacity": 0.12 } }, firstSymbolLayer(map!));
        map!.addLayer({ id: "groupements-line", type: "line", source: "groupements", paint: { "line-color": ["to-color", ["get", "color"]], "line-width": 1.5, "line-opacity": 0.9 } }, firstSymbolLayer(map!));
        map!.addLayer({ id: "groupements-label", type: "symbol", source: "groupements", layout: { "text-field": ["get", "name"], "text-size": 12, "text-font": ["Noto Sans Bold"], "text-allow-overlap": false }, paint: { "text-color": ["to-color", ["get", "color"]], "text-halo-color": "rgba(0,0,0,0.7)", "text-halo-width": 1.2 } });
        fetch("/geo/groupements.json")
          .then((r) => r.json())
          .then((geo: { features: { properties: { id: string; name: string } }[] }) => {
            const names = geo.features.map((f) => f.properties.name);
            setGroupNames(names);
            const src = map!.getSource("groupements") as maplibregl.GeoJSONSource | undefined;
            src?.setData({ ...geo, features: geo.features.map((f, i) => ({ ...f, properties: { ...f.properties, color: groupingColor(i) } })) } as unknown as GeoJSON.FeatureCollection);
          })
          .catch(() => {});
        // Restrictions drones (IGN) : ajoutée masquée, affichée par la vue drone
        map!.addSource("drone-wms", { type: "raster", tiles: [DRONE_WMS], tileSize: 256, attribution: "Restrictions UAS © IGN" });
        map!.addLayer({ id: "drone-wms", type: "raster", source: "drone-wms", layout: { visibility: "none" }, paint: { "raster-opacity": 0.55 } }, firstSymbolLayer(map!));
      });
      mapRef.current = map;
    })();
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carte montée une fois (l'observateur de taille meurt avec la carte)
  }, []);

  // ---- Visibilité des couches vectorielles -----------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const vis = (id: string, on: boolean) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    vis("groupements-fill", layers.groupements);
    vis("groupements-line", layers.groupements);
    vis("groupements-label", layers.groupements);
    vis("drone-wms", layers.drone);
  }, [layers, ready]);

  // ---- Données live -------------------------------------------------------------------
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/carte/live", { credentials: "same-origin" });
      if (res.ok) setLive((await res.json()) as LiveLayers);
      else toast("Couches indisponibles pour le moment.");
    } catch {
      toast("Couches indisponibles hors ligne.");
    } finally {
      setLoading(false);
    }
  }, [toast]);
  useEffect(() => {
    if (!needLive || live) return;
    void refresh();
  }, [needLive, live, refresh]);
  useEffect(() => {
    if (!needLive) return;
    const t = setInterval(() => void refresh(), 10 * 60_000);
    return () => clearInterval(t);
  }, [needLive, refresh]);

  // ---- Marqueurs des couches (étiquettes sous les centres, stations, mer, trafic) -----
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (!map || !lib || !ready) return;
    for (const m of [...liveMarkers.current, ...chipMarkers.current]) m.remove();
    liveMarkers.current = [];
    chipMarkers.current = [];
    if (!live) return;
    const chipLayers = layers.meteo || layers.air || layers.feu || layers.drone;
    if (chipLayers) {
      for (const c of located) {
        const w = weatherOf.get(c.id);
        if (!w) continue;
        const el = document.createElement("span");
        el.className = "atlas-chip";
        const parts: string[] = [];
        if (layers.drone) {
          const v = droneVerdict({ wind10: w.wind10, gust10: w.gust10, wind80: w.wind80, wind120: w.wind120, visibility: w.visibility, precipitation: w.precipitation, cloudCover: w.cloud_cover, isDay: w.is_day });
          parts.push(`<i class="atlas-chip-dot" style="background:${v.level === "go" ? "#5dbe7a" : v.level === "caution" ? "#e5c93c" : "#e4213a"}"></i>${Math.round(Math.max(w.wind10, w.wind80 ?? 0, w.wind120 ?? 0))} km/h`);
        } else {
          if (layers.meteo) parts.push(`${Math.round(w.temperature)}° · ${Math.round(w.wind10)} km/h ${windCardinal(w.wind_dir)}`);
          if (layers.air) parts.push(`<i class="atlas-chip-dot" style="background:${aqiColor(w.aqi)}"></i>air`);
          if (layers.feu) parts.push(`<i class="atlas-chip-dot" style="background:${fireColor(w.fire_level)}"></i>feu`);
        }
        el.innerHTML = parts.join(" · ");
        chipMarkers.current.push(new lib.Marker({ element: el, anchor: "top" }).setLngLat([c.lng, c.lat]).addTo(map));
      }
    }
    const add = (cls: string, lat: number, lng: number, label: string, onClick: () => void) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = cls;
      el.setAttribute("aria-label", label);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onClick();
      });
      liveMarkers.current.push(new lib.Marker({ element: el, anchor: "center" }).setLngLat([lng, lat]).addTo(map));
    };
    if (layers.crues) for (const r of live.rivers) add("atlas-marker-river", r.lat, r.lng, `${r.name}`, () => setSelected({ kind: "river", r }));
    if (layers.mer) for (const s of live.sea) add("atlas-marker-sea", s.lat, s.lng, `Mer à ${s.name}`, () => setSelected({ kind: "sea", s }));
    if (layers.trafic) for (const t of live.traffic.events) add("atlas-marker-traffic", t.lat, t.lng, t.comment ?? t.kind, () => setSelected({ kind: "traffic", t }));
  }, [live, layers, located, weatherOf, ready]);

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

  const activeCount = Object.values(layers).filter(Boolean).length;
  const vig = layers.vigilance ? live?.vigilance : null;
  const vigItems = vig ? vig.items.filter((i) => i.color !== "vert") : [];

  return (
    <div className="space-y-3">
      {vig && (
        <div className="flex items-center gap-3 rounded-[12px] bg-bg-1 px-4 py-2.5" role="status">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: VIGILANCE_HEX[vig.max] }} aria-hidden="true" />
          <span className="min-w-0 flex-1 text-[13px] text-text-1">
            Vigilance Météo-France <span className="font-semibold">{vig.max}</span> sur le Pas-de-Calais
            {vigItems.length > 0 && <span className="text-text-2"> · {[...new Set(vigItems.map((i) => `${i.phenomenon} (${i.color}${i.echeance === "J1" ? ", demain" : ""})`))].join(", ")}</span>}
          </span>
        </div>
      )}
      <div className="relative -mx-3 overflow-hidden bg-bg-1 sm:mx-0 sm:rounded-[16px]">
        <div ref={container} className="h-[min(62dvh,560px)] w-full" aria-label="Carte des centres" role="application" />
        {!ready && !failed && <p className="absolute inset-0 flex items-center justify-center text-[15px] text-text-2">Chargement de la carte…</p>}
        {failed && !ready && <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-[15px] text-text-2">Carte indisponible hors ligne. Les numéros restent accessibles depuis l&apos;annuaire.</p>}
        <div className="absolute left-3 top-3 flex flex-col gap-2">
          <button type="button" onClick={locate} disabled={locating} className="glass-float pressable flex h-11 items-center gap-2 rounded-full px-4 text-[15px] font-semibold text-text-1 disabled:opacity-60">
            <LocateFixed size={18} strokeWidth={1.75} aria-hidden="true" />
            {locating ? "Localisation…" : "Autour de moi"}
          </button>
          <button type="button" onClick={() => setMenu(true)} className="glass-float pressable flex h-11 items-center gap-2 rounded-full px-4 text-[15px] font-semibold text-text-1" aria-haspopup="dialog">
            <Layers size={18} strokeWidth={1.75} aria-hidden="true" />
            Couches <span className="text-text-3">{activeCount}</span>
          </button>
        </div>
        {layers.groupements && groupNames.length > 0 && (
          <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5" aria-label="Légende des groupements">
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
      {needLive && (
        <p className="flex items-center gap-2 px-1 text-[12px] text-text-4">
          {live ? `Données live du ${hhmm(live.generated_at)} · Open-Meteo, Hub'Eau, Météo-France${live.errors.length ? ` · ${live.errors.length} flux indisponible${live.errors.length > 1 ? "s" : ""}` : ""}` : "Chargement des couches…"}
          <button type="button" onClick={() => void refresh()} disabled={loading} aria-label="Actualiser les couches" className="flex h-7 w-7 items-center justify-center rounded-full text-text-3 hover:text-text-1 disabled:opacity-50">
            <RefreshCw size={14} strokeWidth={1.75} className={cn(loading && "animate-spin")} />
          </button>
        </p>
      )}

      {selected && <SelectedPanel sel={selected} weather={selected.kind === "center" ? (weatherOf.get(selected.c.id) ?? null) : null} layers={layers} onClose={() => setSelected(null)} />}

      {layers.drone && live && (
        <section className="space-y-2">
          <h2 className="px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-text-3">Conditions de vol par centre</h2>
          <ul className="hairline rounded-[16px] bg-bg-1">
            {located
              .map((c) => ({ c, w: weatherOf.get(c.id) }))
              .filter((x): x is { c: Located; w: CenterWeather } => Boolean(x.w))
              .map(({ c, w }) => {
                const v = droneVerdict({ wind10: w.wind10, gust10: w.gust10, wind80: w.wind80, wind120: w.wind120, visibility: w.visibility, precipitation: w.precipitation, cloudCover: w.cloud_cover, isDay: w.is_day });
                return { c, w, v };
              })
              .sort((a, b) => (a.v.level === b.v.level ? a.c.name.localeCompare(b.c.name, "fr") : a.v.level === "go" ? -1 : b.v.level === "go" ? 1 : a.v.level === "caution" ? -1 : 1))
              .map(({ c, w, v }) => (
                <li key={c.id}>
                  <button type="button" onClick={() => setSelected({ kind: "center", c })} className="pressable flex w-full items-center gap-3 px-4 py-2.5 text-left">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: v.level === "go" ? "#5dbe7a" : v.level === "caution" ? "#e5c93c" : "#e4213a" }} aria-hidden="true" />
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
          <p className="px-1 text-[12px] text-text-4">Seuils indicatifs catégorie ouverte : prudence dès 36 km/h, refus à 43 km/h de vent moyen (à 10, 80 ou 120 m) ou 54 km/h de rafales, pluie, visibilité sous 1,5 km. Les zones colorées sur la carte sont les restrictions UAS de l&apos;IGN (hors interdictions temporaires : vérifiez les NOTAM et Géoportail avant tout vol).</p>
        </section>
      )}

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

      <Sheet open={menu} onClose={() => setMenu(false)} title="Couches de la carte" tall>
        <div className="space-y-5 px-5 pb-[max(env(safe-area-inset-bottom),20px)]">
          {LAYER_GROUPS.map((g) => (
            <section key={g.title} className="space-y-3">
              <h3 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-text-3">{g.title}</h3>
              {g.layers.map((l) => (
                <CheckboxField key={l.key} label={l.label} name={`layer_${l.key}`} checked={layers[l.key]} onChange={(e) => setLayers((prev) => ({ ...prev, [l.key]: e.target.checked }))} hint={l.key === "trafic" && live && !live.traffic.configured ? "Flux Bison Futé non configuré (variable TRAFIC_FEED_URL, abonnement gratuit)." : l.hint} />
              ))}
            </section>
          ))}
          <p className="text-[12px] text-text-4">Sources gratuites et officielles : Météo-France (vigilance), Open-Meteo (météo, air, mer), Hub&apos;Eau (cours d&apos;eau), IGN (restrictions drones). Rafraîchies toutes les 10 minutes, jamais de position d&apos;engin.</p>
        </div>
      </Sheet>
      <CenterSheetCompact center={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function firstSymbolLayer(map: maplibregl.Map): string | undefined {
  return map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
}

/** Détail de l'élément touché : météo / air / feu / drone d'un centre, station, point de mer, événement trafic. */
function SelectedPanel({ sel, weather, layers, onClose }: { sel: NonNullable<Selected>; weather: CenterWeather | null; layers: Record<LayerKey, boolean>; onClose: () => void }) {
  let title = "";
  let rows: [string, string][] = [];
  if (sel.kind === "center") {
    title = sel.c.name;
    if (!weather) rows = [["Météo", "activez une couche météo pour voir les conditions"]];
    else {
      const v = droneVerdict({ wind10: weather.wind10, gust10: weather.gust10, wind80: weather.wind80, wind120: weather.wind120, visibility: weather.visibility, precipitation: weather.precipitation, cloudCover: weather.cloud_cover, isDay: weather.is_day });
      rows = [
        ["Température", `${Math.round(weather.temperature)} °C · humidité ${Math.round(weather.humidity)} %`],
        ["Vent à 10 m", `${Math.round(weather.wind10)} km/h ${windCardinal(weather.wind_dir)}, rafales ${Math.round(weather.gust10)} km/h`],
        ...(layers.drone ? ([["Vent en altitude", `${weather.wind80 !== null ? Math.round(weather.wind80) : "—"} km/h à 80 m · ${weather.wind120 !== null ? Math.round(weather.wind120) : "—"} km/h à 120 m`], ["Visibilité", weather.visibility !== null ? `${(weather.visibility / 1000).toFixed(1)} km` : "—"], ["Vol", `${v.label}${v.reasons.length ? ` (${v.reasons.join(", ")})` : ""}`], ["Soleil", `lever ${hhmm(weather.sunrise)} · coucher ${hhmm(weather.sunset)}`]] as [string, string][]) : []),
        ...(layers.air ? ([["Qualité de l'air", `${aqiLabel(weather.aqi)}${weather.aqi !== null ? ` (indice ${Math.round(weather.aqi)})` : ""} · PM10 ${weather.pm10 !== null ? Math.round(weather.pm10) : "—"} · ozone ${weather.ozone !== null ? Math.round(weather.ozone) : "—"} µg/m³`]] as [string, string][]) : []),
        ...(layers.feu ? ([["Risque feu (Angström)", `${weather.fire_level} (indice ${weather.fire_index})`]] as [string, string][]) : []),
        ["Précipitations", `${weather.precipitation} mm sur l'heure · nuages ${weather.cloud_cover ?? "—"} %`],
      ];
    }
  } else if (sel.kind === "river") {
    title = sel.r.name;
    rows = [
      ["Cours d'eau", sel.r.river ?? "—"],
      ["Hauteur", sel.r.height_m !== null ? `${sel.r.height_m.toFixed(2)} m` : "pas de mesure récente"],
      ["Tendance 6 h", sel.r.trend],
      ["Mesure", hhmm(sel.r.at)],
    ];
  } else if (sel.kind === "sea") {
    title = `Mer à ${sel.s.name}`;
    rows = [
      ["Houle", sel.s.wave_height !== null ? `${sel.s.wave_height.toFixed(1)} m, période ${sel.s.wave_period !== null ? Math.round(sel.s.wave_period) : "—"} s` : "—"],
      ["Mer du vent", sel.s.wind_wave !== null ? `${sel.s.wind_wave.toFixed(1)} m` : "—"],
      ["Niveau", sel.s.sea_level !== null ? `${sel.s.sea_level.toFixed(2)} m / niveau moyen` : "—"],
      ["Prochaine pleine mer", hhmm(sel.s.next_high)],
      ["Prochaine basse mer", hhmm(sel.s.next_low)],
    ];
  } else {
    title = sel.t.road ? `${sel.t.road} · ${sel.t.kind}` : sel.t.kind;
    rows = [
      ["Gravité", sel.t.severity],
      ["Détail", sel.t.comment ?? "—"],
      ["Mise à jour", hhmm(sel.t.updated_at)],
    ];
  }
  return (
    <section className="rounded-[16px] bg-bg-1 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-text-1">{title}</h2>
        <button type="button" onClick={onClose} className="text-[13px] text-text-3 hover:text-text-1">
          Fermer
        </button>
      </div>
      <dl className="mt-2 space-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-3 text-[13px]">
            <dt className="w-32 shrink-0 text-text-3">{k}</dt>
            <dd className="min-w-0 flex-1 text-text-1">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
