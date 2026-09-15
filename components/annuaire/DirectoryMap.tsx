"use client";

import { useEffect, useRef, useState } from "react";
import type maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { LocateFixed, Phone } from "lucide-react";
import type { DirectoryCenter } from "@/lib/centres/directory-types";
import { CENTER_TYPE_LABELS } from "@/lib/config";
import { telHref } from "@/lib/geo/maps";
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

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

/**
 * Carte des centres (MapLibre GL + OpenFreeMap) : marqueurs blancs, le
 * rattachement en rouge, tap → fiche compacte. « Autour de moi » demande la
 * position à l'agent, jamais par défaut ; rien n'est enregistré.
 */
export function DirectoryMap({ centers, homeCenterId }: { centers: DirectoryCenter[]; homeCenterId: string | null }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<DirectoryCenter | null>(null);
  const [nearest, setNearest] = useState<(DirectoryCenter & { km: number })[] | null>(null);
  const [locating, setLocating] = useState(false);
  const toast = useToast();
  const located = centers.filter((c): c is DirectoryCenter & { lat: number; lng: number } => c.lat != null && c.lng != null);

  useEffect(() => {
    let map: maplibregl.Map | null = null;
    let cancelled = false;
    (async () => {
      const lib = await import("maplibre-gl");
      if (cancelled || !container.current) return;
      map = new lib.Map({
        container: container.current,
        style: MAP_STYLE,
        bounds: DEFAULT_BOUNDS,
        fitBoundsOptions: { padding: 24 },
        attributionControl: { compact: true },
        cooperativeGestures: false,
      });
      map.addControl(new lib.NavigationControl({ showCompass: false }), "top-right");
      map.on("error", () => setFailed(true));
      map.on("load", () => {
        if (cancelled) return;
        setReady(true);
        for (const c of located) {
          const el = document.createElement("button");
          el.type = "button";
          el.className = cn("atlas-marker", c.id === homeCenterId && "atlas-marker-home");
          el.setAttribute("aria-label", c.name);
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
        if (map) {
          const lib = await import("maplibre-gl");
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

  return (
    <div className="space-y-3">
      <div className="relative -mx-3 overflow-hidden bg-bg-1 sm:mx-0 sm:rounded-[16px]">
        <div ref={container} className="h-[min(62dvh,560px)] w-full" aria-label="Carte des centres" role="application" />
        {!ready && !failed && <p className="absolute inset-0 flex items-center justify-center text-[15px] text-text-2">Chargement de la carte…</p>}
        {failed && !ready && <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-[15px] text-text-2">Carte indisponible hors ligne. Les numéros restent accessibles depuis l&apos;annuaire.</p>}
        <button type="button" onClick={locate} disabled={locating} className="glass-float pressable absolute left-3 top-3 flex h-11 items-center gap-2 rounded-full px-4 text-[15px] font-semibold text-text-1 disabled:opacity-60">
          <LocateFixed size={18} strokeWidth={1.75} aria-hidden="true" />
          {locating ? "Localisation…" : "Autour de moi"}
        </button>
      </div>
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
