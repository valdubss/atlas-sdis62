"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Search } from "lucide-react";
import { attachTo } from "@/app/(app)/centre/actions";
import type { Directory } from "@/lib/centres/public";
import { CENTER_TYPE_LABELS } from "@/lib/config";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";

function normalize(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Liste des centres par groupement (services de direction en bas), avec
 * recherche par nom ou ville.
 *  - mode "attach" : choisir son rattachement (profil), puis ouvrir la page
 *  - mode "browse" : simples liens vers les pages (annuaire)
 */
export function CenterPicker({ directory, mode, currentCenterId, currentServiceId }: { directory: Directory; mode: "attach" | "browse"; currentCenterId?: string | null; currentServiceId?: string | null }) {
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const { groups, services } = useMemo(() => {
    const n = normalize(q.trim());
    const match = (s: string | null | undefined) => !n || normalize(s ?? "").includes(n);
    const centers = directory.centers.filter((c) => match(c.name) || match(c.city));
    const groups = [
      ...directory.groupings.map((g) => ({ key: g.id, name: g.name, items: centers.filter((c) => c.grouping_id === g.id) })),
      { key: "none", name: "Autres", items: centers.filter((c) => !c.grouping_id || !directory.groupings.some((g) => g.id === c.grouping_id)) },
    ].filter((g) => g.items.length > 0);
    return { groups, services: directory.services.filter((s) => match(s.name) || match(s.short_description)) };
  }, [directory, q]);

  function pick(kind: "center" | "service", id: string) {
    start(async () => {
      const r = await attachTo(kind === "center" ? { center_id: id, service_id: "" } : { center_id: "", service_id: id });
      if (!r.ok) {
        toast(r.error);
        return;
      }
      toast("Rattachement enregistré");
      router.push(r.href);
      router.refresh();
    });
  }

  const empty = groups.length === 0 && services.length === 0;

  return (
    <div className={cn("space-y-4", pending && "opacity-70")}>
      <label className="relative block">
        <Search size={18} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-3" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nom du centre ou ville"
          aria-label="Rechercher un centre"
          autoComplete="off"
          className="block h-11 w-full rounded-[12px] bg-bg-1 pl-10 pr-3.5 text-[15px] text-text-1 outline-none ring-1 ring-transparent placeholder:text-text-3 focus:ring-glass-edge"
        />
      </label>

      {empty && <p className="px-1 py-6 text-center text-[15px] text-text-2">Aucun centre ne correspond.</p>}

      {groups.map((g) => (
        <section key={g.key} className="space-y-2">
          <h2 className="px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-text-3">{g.name}</h2>
          <ul className="hairline rounded-[16px] bg-bg-1">
            {g.items.map((c) => (
              <li key={c.id}>
                <Row
                  title={c.name}
                  subtitle={[CENTER_TYPE_LABELS[c.type], c.city].filter(Boolean).join(" · ")}
                  current={c.id === currentCenterId}
                  href={mode === "browse" ? `/centre/${c.slug}` : undefined}
                  onClick={mode === "attach" ? () => pick("center", c.id) : undefined}
                  disabled={pending}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {services.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-text-3">Services de la direction</h2>
          <ul className="hairline rounded-[16px] bg-bg-1">
            {services.map((s) => (
              <li key={s.id}>
                <Row title={s.name} subtitle={s.short_description ?? "Service"} current={s.id === currentServiceId} href={mode === "browse" ? `/service/${s.slug}` : undefined} onClick={mode === "attach" ? () => pick("service", s.id) : undefined} disabled={pending} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Row({ title, subtitle, current, href, onClick, disabled }: { title: string; subtitle: string; current: boolean; href?: string; onClick?: () => void; disabled: boolean }) {
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] text-text-1">{title}</span>
        <span className="block truncate text-[13px] text-text-3">{subtitle}</span>
      </span>
      {current ? <span className="text-[13px] font-medium text-text-2">Actuel</span> : <ChevronRight size={20} strokeWidth={1.75} className="text-text-3" aria-hidden="true" />}
    </>
  );
  const cls = "pressable flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left";
  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls} aria-current={current ? "true" : undefined}>
      {inner}
    </button>
  );
}
