"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { deleteGrouping, saveGrouping } from "@/app/(studio)/studio/centres/actions";
import type { Center, Grouping, Service } from "@/lib/supabase/database.types";
import { CENTER_TYPE_LABELS } from "@/lib/config";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";

type CenterRow = Center & { grouping: { name: string } | null; referents_count: number };

/** Studio → Centres → Référentiel : groupements (inline), centres et services (fiches). */
export function ReferentielPanel({ groupings, centers, services }: { groupings: Grouping[]; centers: CenterRow[]; services: Service[] }) {
  const [newGrouping, setNewGrouping] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    start(async () => {
      const r = await fn();
      toast(r.ok ? ok : (r.error ?? "Erreur"));
      if (r.ok) router.refresh();
    });
  }

  const byGrouping = new Map<string, CenterRow[]>();
  for (const c of centers) {
    const k = c.grouping?.name ?? "Sans groupement";
    byGrouping.set(k, [...(byGrouping.get(k) ?? []), c]);
  }

  return (
    <div className="mx-auto max-w-[960px] space-y-8">
      <div>
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text-1">Référentiel</h1>
        <p className="text-[13px] text-text-3">
          Groupements, centres et services du SDIS. Import en masse : <code className="text-text-2">npm run import:centres</code> (voir README).{" "}
          <Link href="/studio/centres" className="text-navy-link">
            File de validation
          </Link>
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">
          Groupements <span className="text-text-3">{groupings.length}</span>
        </h2>
        <div className="hairline rounded-[16px] bg-bg-1">
          {groupings.map((g) => (
            <div key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5">
              <input
                defaultValue={g.name}
                aria-label={`Nom du groupement ${g.name}`}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== g.name) run(() => saveGrouping({ id: g.id, name: v, sort_order: g.sort_order }), "Groupement renommé");
                }}
                className="h-10 min-w-0 basis-full rounded-[8px] bg-transparent px-2 text-[15px] text-text-1 outline-none focus:bg-bg-2 sm:basis-auto sm:flex-1"
              />
              <input
                type="number"
                defaultValue={g.sort_order}
                aria-label="Ordre"
                onBlur={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n !== g.sort_order) run(() => saveGrouping({ id: g.id, name: g.name, sort_order: n }), "Ordre mis à jour");
                }}
                className="h-10 w-16 rounded-[8px] bg-bg-2 px-2 text-center text-[13px] text-text-2 outline-none"
              />
              <span className="min-w-0 flex-1 text-[13px] text-text-3 sm:flex-none sm:w-24 sm:text-right">{centers.filter((c) => c.grouping_id === g.id).length} centre{centers.filter((c) => c.grouping_id === g.id).length > 1 ? "s" : ""}</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (confirm(`Supprimer le groupement « ${g.name} » ? Ses centres resteront, sans groupement.`)) run(() => deleteGrouping(g.id), "Groupement supprimé");
                }}
                className="text-[13px] text-text-3 hover:text-red-text"
              >
                Supprimer
              </button>
            </div>
          ))}
          <form
            className="flex items-center gap-2 px-5 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              const name = newGrouping.trim();
              if (!name) return;
              run(() => saveGrouping({ name, sort_order: groupings.length + 1 }), "Groupement ajouté");
              setNewGrouping("");
            }}
          >
            <input value={newGrouping} onChange={(e) => setNewGrouping(e.target.value)} placeholder="Nouveau groupement (ex. Groupement Nord)" aria-label="Nouveau groupement" maxLength={80} className="h-10 min-w-0 flex-1 rounded-[10px] bg-bg-2 px-3 text-[15px] text-text-1 outline-none" />
            <button type="submit" disabled={pending || !newGrouping.trim()} className="pressable flex h-10 items-center gap-1 rounded-[10px] bg-bg-2 px-3 text-[13px] font-medium text-text-1 disabled:opacity-40">
              <Plus size={16} strokeWidth={1.75} aria-hidden="true" /> Ajouter
            </button>
          </form>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">
            Centres <span className="text-text-3">{centers.length}</span>
          </h2>
          <Link href="/studio/centres/referentiel/centre/new" className="pressable flex h-10 items-center gap-1 rounded-[10px] bg-red-fill px-3 text-[13px] font-semibold text-white">
            <Plus size={16} strokeWidth={2} aria-hidden="true" /> Nouveau centre
          </Link>
        </div>
        {[...byGrouping.entries()].map(([name, list]) => (
          <div key={name} className="space-y-2">
            <h3 className="px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-text-3">{name}</h3>
            <div className="hairline rounded-[16px] bg-bg-1">
              {list.map((c) => (
                <Link key={c.id} href={`/studio/centres/referentiel/centre/${c.id}`} className="pressable flex items-center gap-3 px-5 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-text-1">{c.name}</span>
                    <span className="block truncate text-[13px] text-text-3">
                      {c.city ?? "Ville non renseignée"}
                      {c.phone && ` · ${c.phone}`} · {c.referents_count} référent{c.referents_count > 1 ? "s" : ""}
                      {c.pending_at && " · mise à jour proposée"}
                    </span>
                  </span>
                  <Badge>{CENTER_TYPE_LABELS[c.type]}</Badge>
                  {!c.is_active && <Badge tone="red">Inactif</Badge>}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">
            Services <span className="text-text-3">{services.length}</span>
          </h2>
          <Link href="/studio/centres/referentiel/service/new" className="pressable flex h-10 items-center gap-1 rounded-[10px] bg-red-fill px-3 text-[13px] font-semibold text-white">
            <Plus size={16} strokeWidth={2} aria-hidden="true" /> Nouveau service
          </Link>
        </div>
        <div className="hairline rounded-[16px] bg-bg-1">
          {services.length === 0 ? (
            <p className="px-5 py-6 text-[15px] text-text-2">Aucun service. Ajoutez les services de la direction (RH, formation, SSSM…).</p>
          ) : (
            services.map((s) => (
              <Link key={s.id} href={`/studio/centres/referentiel/service/${s.id}`} className="pressable flex items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] text-text-1">{s.name}</span>
                  <span className="block truncate text-[13px] text-text-3">{s.short_description ?? "Description à compléter"}</span>
                </span>
                {!s.is_active && <Badge tone="red">Inactif</Badge>}
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
