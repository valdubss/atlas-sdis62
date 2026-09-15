"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mail, MapPin, Navigation, Phone } from "lucide-react";
import { getCenterDetails, getServiceDetails } from "@/app/(app)/annuaire/actions";
import type { CenterDetails, DirectoryCenter, DirectoryService, PersonCard, ServiceDetails } from "@/lib/centres/directory-types";
import { CENTER_TYPE_LABELS } from "@/lib/config";
import { directionsUrl, telHref } from "@/lib/geo/maps";
import { Sheet } from "@/components/ui/Sheet";
import { Avatar } from "@/components/ui/Avatar";
import { Skeleton } from "@/components/ui/Skeleton";

function PersonRow({ p, role }: { p: PersonCard; role?: string | null }) {
  return (
    <li className="flex items-center gap-3">
      <Avatar name={`${p.first_name} ${p.last_name}`} avatarKey={p.avatar_key} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] text-text-1">
          {p.first_name} {p.last_name}
        </span>
        {(role ?? p.job_title) && <span className="block truncate text-[13px] text-text-3">{role ?? p.job_title}</span>}
      </span>
      {p.work_phone && (
        <a href={telHref(p.work_phone)} aria-label={`Appeler ${p.first_name} ${p.last_name}`} className="pressable flex h-10 w-10 items-center justify-center rounded-full bg-bg-2 text-text-1">
          <Phone size={18} strokeWidth={1.75} />
        </a>
      )}
    </li>
  );
}

function ContactActions({ phone, email, lat, lng, label }: { phone: string | null; email: string | null; lat: number | null; lng: number | null; label: string }) {
  const [directions, setDirections] = useState<string | null>(null);
  useEffect(() => {
    if (lat != null && lng != null) setDirections(directionsUrl(lat, lng, label));
  }, [lat, lng, label]);
  if (!phone && !email && !directions) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {phone && (
        <a href={telHref(phone)} className="pressable inline-flex h-11 items-center gap-2 rounded-[12px] bg-red-fill px-4 text-[15px] font-semibold text-white">
          <Phone size={18} strokeWidth={1.75} aria-hidden="true" />
          Appeler
        </a>
      )}
      {directions && (
        <a href={directions} target="_blank" rel="noopener" className="pressable inline-flex h-11 items-center gap-2 rounded-[12px] bg-bg-2 px-4 text-[15px] font-semibold text-text-1">
          <Navigation size={18} strokeWidth={1.75} aria-hidden="true" />
          Itinéraire
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} className="pressable inline-flex h-11 items-center gap-2 rounded-[12px] bg-bg-2 px-4 text-[15px] font-semibold text-text-1">
          <Mail size={18} strokeWidth={1.75} aria-hidden="true" />
          E-mail
        </a>
      )}
    </div>
  );
}

/** Fiche compacte d'un centre : coordonnées, actions, chef, référents, agents visibles. */
export function CenterSheetCompact({ center, onClose }: { center: DirectoryCenter | null; onClose: () => void }) {
  const [details, setDetails] = useState<CenterDetails | null>(null);
  useEffect(() => {
    setDetails(null);
    if (!center) return;
    let alive = true;
    getCenterDetails(center.slug).then((d) => alive && setDetails(d));
    return () => {
      alive = false;
    };
  }, [center]);
  const address = center ? [center.address, [center.postal_code, center.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";
  return (
    <Sheet open={center !== null} onClose={onClose} title={center?.name ?? "Centre"}>
      {center && (
        <div className="space-y-4 px-5 pb-[max(env(safe-area-inset-bottom),20px)]">
          <p className="text-[13px] text-text-3">{[CENTER_TYPE_LABELS[center.type], details?.center.grouping?.name].filter(Boolean).join(" · ")}</p>
          {address && (
            <p className="flex items-start gap-2 text-[15px] text-text-1">
              <MapPin size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-text-3" aria-hidden="true" />
              {address}
            </p>
          )}
          <ContactActions phone={center.phone} email={center.email} lat={center.lat} lng={center.lng} label={center.name} />
          {details === null ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="h-10 w-1/2" />
            </div>
          ) : (
            <>
              {(details.chief || details.referents.length > 0) && (
                <ul className="space-y-3">
                  {details.chief && <PersonRow p={details.chief} role="Chef de centre" />}
                  {details.referents
                    .filter((r) => r.id !== details.chief?.id)
                    .map((r) => (
                      <PersonRow key={r.id} p={r} role="Référent communication" />
                    ))}
                </ul>
              )}
              {details.people.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-text-3">Agents ({details.people.length})</h3>
                  <ul className="space-y-3">
                    {details.people.map((p) => (
                      <PersonRow key={p.id} p={p} />
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
          <Link href={`/centre/${center.slug}`} className="pressable inline-flex h-11 items-center rounded-[12px] px-1 text-[15px] font-medium text-navy-link">
            Voir la page du centre
          </Link>
        </div>
      )}
    </Sheet>
  );
}

/** Fiche compacte d'un service : pour quoi les contacter, responsable, contact, agents visibles. */
export function ServiceSheetCompact({ service, onClose }: { service: DirectoryService | null; onClose: () => void }) {
  const [details, setDetails] = useState<ServiceDetails | null>(null);
  useEffect(() => {
    setDetails(null);
    if (!service) return;
    let alive = true;
    getServiceDetails(service.slug).then((d) => alive && setDetails(d));
    return () => {
      alive = false;
    };
  }, [service]);
  return (
    <Sheet open={service !== null} onClose={onClose} title={service?.name ?? "Service"}>
      {service && (
        <div className="space-y-4 px-5 pb-[max(env(safe-area-inset-bottom),20px)]">
          {service.short_description && <p className="text-[15px] text-text-2">{service.short_description}</p>}
          {service.contact_reasons.length > 0 && (
            <ul className="space-y-1">
              {service.contact_reasons.map((r) => (
                <li key={r} className="flex items-start gap-2 text-[15px] text-text-1">
                  <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-text-3" aria-hidden="true" />
                  {r}
                </li>
              ))}
            </ul>
          )}
          {service.address && (
            <p className="flex items-start gap-2 text-[15px] text-text-1">
              <MapPin size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-text-3" aria-hidden="true" />
              {service.address}
            </p>
          )}
          <ContactActions phone={service.phone} email={service.email} lat={null} lng={null} label={service.name} />
          {details === null ? (
            <Skeleton className="h-10 w-2/3" />
          ) : (
            <>
              {details.manager && (
                <ul>
                  <PersonRow p={details.manager} role={details.manager.job_title ?? "Responsable"} />
                </ul>
              )}
              {details.people.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-text-3">Agents ({details.people.length})</h3>
                  <ul className="space-y-3">
                    {details.people.map((p) => (
                      <PersonRow key={p.id} p={p} />
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
          <Link href={`/service/${service.slug}`} className="pressable inline-flex h-11 items-center rounded-[12px] px-1 text-[15px] font-medium text-navy-link">
            Voir la page du service
          </Link>
        </div>
      )}
    </Sheet>
  );
}
