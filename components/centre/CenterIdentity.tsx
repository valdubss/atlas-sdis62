"use client";

import { useEffect, useState } from "react";
import { MapPin, Navigation, Phone, Users } from "lucide-react";
import type { CenterPublic } from "@/lib/centres/public";
import { directionsUrl, telHref } from "@/lib/geo/maps";
import { Avatar } from "@/components/ui/Avatar";
import { ContactExtras } from "@/components/annuaire/ContactExtras";

/** Identité du centre : chef, référents, présentation, coordonnées et actions (Appeler, Itinéraire). */
export function CenterIdentity({ center }: { center: CenterPublic }) {
  const [directions, setDirections] = useState<string | null>(null);
  useEffect(() => {
    if (center.lat != null && center.lng != null) setDirections(directionsUrl(center.lat, center.lng, center.name));
  }, [center.lat, center.lng, center.name]);

  const address = [center.address, [center.postal_code, center.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const people = [...(center.chief ? [{ ...center.chief, role: "Chef de centre" }] : []), ...center.referents.filter((r) => r.id !== center.chief?.id).map((r) => ({ ...r, role: "Référent communication" }))];
  if (!center.presentation && people.length === 0 && !address && center.displayed_headcount == null && !center.phone && !directions && !center.slug) return null;

  return (
    <section className="space-y-4 rounded-[16px] bg-bg-1 px-5 py-4">
      {center.presentation && <p className="whitespace-pre-line text-[15px] leading-[1.5] text-text-1">{center.presentation}</p>}

      {people.length > 0 && (
        <ul className="space-y-3">
          {people.map((p) => (
            <li key={`${p.id}-${p.role}`} className="flex items-center gap-3">
              <Avatar name={`${p.first_name} ${p.last_name}`} avatarKey={p.avatar_key} size="md" />
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-medium text-text-1">
                  {p.first_name} {p.last_name}
                </span>
                <span className="block truncate text-[13px] text-text-3">{p.role}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {(address || center.displayed_headcount != null) && (
        <div className="space-y-1.5 text-[13px] text-text-2">
          {address && (
            <p className="flex items-start gap-2">
              <MapPin size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-text-3" aria-hidden="true" />
              <span>{address}</span>
            </p>
          )}
          {center.displayed_headcount != null && (
            <p className="flex items-center gap-2">
              <Users size={16} strokeWidth={1.75} className="shrink-0 text-text-3" aria-hidden="true" />
              {center.displayed_headcount} sapeurs-pompiers
            </p>
          )}
        </div>
      )}

      <ContactExtras kind="centre" slug={center.slug} name={center.name} phone={center.phone} />
      {(center.phone || directions) && (
        <div className="flex flex-wrap gap-2">
          {center.phone && (
            <a href={telHref(center.phone)} className="pressable inline-flex h-11 items-center gap-2 rounded-[12px] bg-bg-2 px-4 text-[15px] font-semibold text-text-1">
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
        </div>
      )}
    </section>
  );
}
