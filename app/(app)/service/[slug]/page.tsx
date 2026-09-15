import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Mail, MapPin, Phone } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/server";
import { fetchServiceBySlug } from "@/lib/centres/public";
import { TopBar } from "@/components/layout/TopBar";
import { Avatar } from "@/components/ui/Avatar";
import { Markdown } from "@/components/feed/Markdown";
import { telHref } from "@/lib/geo/maps";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const service = await fetchServiceBySlug(slug);
  return { title: service?.name ?? "Service" };
}

/** Page d'un service de direction : mission, pour quoi les contacter, responsable, coordonnées. */
export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }, current] = await Promise.all([params, getCurrentUser()]);
  if (!current) redirect("/auth/deconnexion?raison=profil");
  const service = await fetchServiceBySlug(slug);
  if (!service) notFound();
  const isHome = current.profile.service_id === service.id;

  return (
    <div className="space-y-3">
      <TopBar title={service.name} leading={!isHome ? <Link href="/annuaire" className="pressable -ml-2 flex h-12 items-center pr-2 text-[15px] font-medium text-text-2 hover:text-text-1">Annuaire</Link> : undefined} />
      <div className="px-1 pb-1 pt-1">
        <h1 className="text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] text-text-1">{service.name}</h1>
        {service.short_description && <p className="mt-1 text-[15px] text-text-2">{service.short_description}</p>}
        {service.grouping && <p className="mt-1 text-[13px] text-text-3">{service.grouping.name}</p>}
      </div>

      {service.mission && (
        <section className="rounded-[16px] bg-bg-1 px-5 py-4">
          <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">Mission</h2>
          <div className="mt-2 text-[15px] leading-[1.5] text-text-1">
            <Markdown>{service.mission}</Markdown>
          </div>
        </section>
      )}

      {service.contact_reasons.length > 0 && (
        <section className="rounded-[16px] bg-bg-1 px-5 py-4">
          <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">Pour quoi les contacter</h2>
          <ul className="mt-2 space-y-1.5">
            {service.contact_reasons.map((r) => (
              <li key={r} className="flex items-start gap-2 text-[15px] text-text-1">
                <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-text-3" aria-hidden="true" />
                {r}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-4 rounded-[16px] bg-bg-1 px-5 py-4">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">Contact</h2>
        {service.manager && (
          <div className="flex items-center gap-3">
            <Avatar name={`${service.manager.first_name} ${service.manager.last_name}`} avatarKey={service.manager.avatar_key} size="md" />
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-medium text-text-1">
                {service.manager.first_name} {service.manager.last_name}
              </span>
              <span className="block text-[13px] text-text-3">{service.manager.job_title ?? "Responsable"}</span>
            </span>
          </div>
        )}
        <div className="space-y-1.5 text-[13px] text-text-2">
          {service.address && (
            <p className="flex items-start gap-2">
              <MapPin size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-text-3" aria-hidden="true" />
              {service.address}
            </p>
          )}
          {service.email && (
            <p className="flex items-center gap-2">
              <Mail size={16} strokeWidth={1.75} className="shrink-0 text-text-3" aria-hidden="true" />
              <a href={`mailto:${service.email}`} className="text-navy-link">
                {service.email}
              </a>
            </p>
          )}
        </div>
        {service.phone && (
          <a href={telHref(service.phone)} className="pressable inline-flex h-11 items-center gap-2 rounded-[12px] bg-bg-2 px-4 text-[15px] font-semibold text-text-1">
            <Phone size={18} strokeWidth={1.75} aria-hidden="true" />
            Appeler
          </a>
        )}
        {!service.manager && !service.phone && !service.email && !service.address && <p className="text-[15px] text-text-2">Coordonnées à compléter par le service communication.</p>}
      </section>
    </div>
  );
}
