"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronRight, Map, Phone, Search, X } from "lucide-react";
import { search } from "@/app/(app)/annuaire/actions";
import type { DirectoryCenter, DirectoryData, DirectoryService, SearchResult } from "@/lib/centres/directory-types";
import { CENTER_TYPE_LABELS } from "@/lib/config";
import { telHref } from "@/lib/geo/maps";
import { Avatar } from "@/components/ui/Avatar";
import { CenterSheetCompact, ServiceSheetCompact } from "./CompactSheets";
import { OfflineBadge } from "./OfflineBadge";
import { cn } from "@/lib/cn";

type Segment = "centers" | "services";

function normalize(s: string | null | undefined) {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Annuaire : recherche instantanée (locale sur centres et services, serveur
 * tolérant aux fautes pour les agents visibles), segments Centres · Services,
 * fiches compactes en feuille, lien vers la carte.
 */
export function DirectoryView({ data, homeCenterId }: { data: DirectoryData; homeCenterId: string | null }) {
  const [q, setQ] = useState("");
  const [segment, setSegment] = useState<Segment>("centers");
  const [remote, setRemote] = useState<SearchResult | null>(null);
  const [pending, start] = useTransition();
  const [openCenter, setOpenCenter] = useState<DirectoryCenter | null>(null);
  const [openService, setOpenService] = useState<DirectoryService | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus automatique sur grand écran seulement (pas de clavier qui surgit sur mobile)
  useEffect(() => {
    if (window.matchMedia("(pointer: fine) and (min-width: 768px)").matches) inputRef.current?.focus();
  }, []);

  const query = q.trim();
  useEffect(() => {
    if (query.length < 2) {
      setRemote(null);
      return;
    }
    const t = setTimeout(() => start(async () => setRemote(await search(query))), 150);
    return () => clearTimeout(t);
  }, [query]);

  const n = normalize(query);
  const localCenters = useMemo(() => (n ? data.centers.filter((c) => normalize(c.name).includes(n) || normalize(c.city).includes(n)) : data.centers), [data.centers, n]);
  const localServices = useMemo(
    () => (n ? data.services.filter((s) => normalize(s.name).includes(n) || normalize(s.short_description).includes(n) || s.contact_reasons.some((r) => normalize(r).includes(n))) : data.services),
    [data.services, n],
  );
  // Résultats serveur (fautes de frappe) ajoutés aux résultats locaux
  const centers = useMemo(() => {
    if (!remote) return localCenters;
    const ids = new Set(localCenters.map((c) => c.id));
    return [...localCenters, ...remote.centers.filter((c) => !ids.has(c.id)).map((c) => data.centers.find((d) => d.id === c.id)).filter((c): c is DirectoryCenter => Boolean(c))];
  }, [localCenters, remote, data.centers]);
  const services = useMemo(() => {
    if (!remote) return localServices;
    const ids = new Set(localServices.map((s) => s.id));
    return [...localServices, ...remote.services.filter((s) => !ids.has(s.id)).map((s) => data.services.find((d) => d.id === s.id)).filter((s): s is DirectoryService => Boolean(s))];
  }, [localServices, remote, data.services]);

  const byGrouping = useMemo(() => {
    const groups = data.groupings.map((g) => ({ key: g.id, name: g.name, items: centers.filter((c) => c.grouping_id === g.id) }));
    const rest = centers.filter((c) => !c.grouping_id || !data.groupings.some((g) => g.id === c.grouping_id));
    return [...groups, { key: "none", name: data.groupings.length ? "Autres" : "Centres", items: rest }].filter((g) => g.items.length > 0);
  }, [centers, data.groupings]);

  const searching = query.length >= 2;
  const people = remote?.people ?? [];

  return (
    <div className="space-y-4">
      <div className="glass sticky top-[calc(48px+env(safe-area-inset-top))] z-20 -mx-3 space-y-2 px-3 pb-2 pt-1 sm:-mx-8 sm:px-8">
        <label className="relative block">
          <Search size={18} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-3" />
          <input
            ref={inputRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Centre, ville, service, agent"
            aria-label="Rechercher dans l'annuaire"
            autoComplete="off"
            enterKeyHint="search"
            className="block h-11 w-full rounded-[12px] bg-bg-1 pl-10 pr-10 text-[15px] text-text-1 outline-none ring-1 ring-transparent placeholder:text-text-3 focus:ring-glass-edge"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Effacer" className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-text-3 hover:text-text-1">
              <X size={18} strokeWidth={1.75} />
            </button>
          )}
        </label>
        <div className="flex items-center gap-2">
          <div role="tablist" aria-label="Type" className="flex flex-1 rounded-full bg-bg-1 p-1">
            {(
              [
                ["centers", `Centres${searching ? ` (${centers.length})` : ""}`],
                ["services", `Services${searching ? ` (${services.length})` : ""}`],
              ] as [Segment, string][]
            ).map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={segment === key} onClick={() => setSegment(key)} className={cn("h-9 flex-1 rounded-full text-[13px] font-medium", segment === key ? "bg-bg-2 text-text-1" : "text-text-2")}>
                {label}
              </button>
            ))}
          </div>
          <Link href="/annuaire/carte" className="pressable flex h-11 items-center gap-1.5 rounded-[12px] bg-bg-1 px-3 text-[13px] font-medium text-text-1" aria-label="Carte des centres">
            <Map size={18} strokeWidth={1.75} aria-hidden="true" />
            Carte
          </Link>
        </div>
      </div>

      <OfflineBadge />

      {searching && people.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-text-3">Agents</h2>
          <ul className="hairline rounded-[16px] bg-bg-1">
            {people.map((p) => (
              <li key={p.id} className="flex min-h-[56px] items-center gap-3 px-4 py-2">
                <Avatar name={`${p.first_name} ${p.last_name}`} avatarKey={p.avatar_key} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] text-text-1">
                    {p.first_name} {p.last_name}
                  </span>
                  <span className="block truncate text-[13px] text-text-3">{[p.job_title, p.center?.name ?? p.service?.name].filter(Boolean).join(" · ") || "Agent"}</span>
                </span>
                {p.work_phone && (
                  <a href={telHref(p.work_phone)} aria-label={`Appeler ${p.first_name} ${p.last_name}`} className="pressable flex h-10 w-10 items-center justify-center rounded-full bg-bg-2 text-text-1">
                    <Phone size={18} strokeWidth={1.75} />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {segment === "centers" &&
        (byGrouping.length === 0 ? (
          <p className="px-1 py-6 text-center text-[15px] text-text-2">{pending ? "Recherche…" : "Aucun centre ne correspond."}</p>
        ) : (
          byGrouping.map((g) => (
            <section key={g.key} className="space-y-2">
              <h2 className="px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-text-3">{g.name}</h2>
              <ul className="hairline rounded-[16px] bg-bg-1">
                {g.items.map((c) => (
                  <li key={c.id} className="flex items-center">
                    <button type="button" onClick={() => setOpenCenter(c)} className="pressable flex min-h-[56px] min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] text-text-1">
                          {c.name}
                          {c.id === homeCenterId && <span className="ml-2 text-[12px] font-medium text-red-text">Mon centre</span>}
                        </span>
                        <span className="block truncate text-[13px] text-text-3">{[CENTER_TYPE_LABELS[c.type], c.city].filter(Boolean).join(" · ")}</span>
                      </span>
                      <ChevronRight size={20} strokeWidth={1.75} className="text-text-3" aria-hidden="true" />
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
          ))
        ))}

      {segment === "services" &&
        (services.length === 0 ? (
          <p className="px-1 py-6 text-center text-[15px] text-text-2">{data.services.length === 0 ? "Les services de la direction seront ajoutés par le service communication." : "Aucun service ne correspond."}</p>
        ) : (
          <ul className="hairline rounded-[16px] bg-bg-1">
            {services.map((s) => (
              <li key={s.id} className="flex items-center">
                <button type="button" onClick={() => setOpenService(s)} className="pressable flex min-h-[56px] min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-text-1">{s.name}</span>
                    <span className="block truncate text-[13px] text-text-3">{s.short_description ?? "Service de la direction"}</span>
                  </span>
                  <ChevronRight size={20} strokeWidth={1.75} className="text-text-3" aria-hidden="true" />
                </button>
                {s.phone && (
                  <a href={telHref(s.phone)} aria-label={`Appeler ${s.name}`} className="pressable mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bg-2 text-text-1">
                    <Phone size={18} strokeWidth={1.75} />
                  </a>
                )}
              </li>
            ))}
          </ul>
        ))}

      <CenterSheetCompact center={openCenter} onClose={() => setOpenCenter(null)} />
      <ServiceSheetCompact service={openService} onClose={() => setOpenService(null)} />
    </div>
  );
}
