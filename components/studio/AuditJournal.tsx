"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { declareIncident, fetchAudit, resolveIncident, type AuditEntry, type AuditFilters } from "@/app/(studio)/studio/journal/actions";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Field, SelectField, TextareaField } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";

export type AuditFacets = { actors: { id: string; name: string }[]; entities: string[] };
export type IncidentRow = { id: string; title: string; service: string; started_at: string; resolved_at: string | null; note: string | null };

const ACTIONS: Record<string, string> = { insert: "création", update: "modification", delete: "suppression" };
const ENTITIES: Record<string, string> = { posts: "publications", stories: "stories", flashes: "flashs", events: "agenda", centers: "centres", channels: "messagerie", categories: "séries", app_settings: "paramètres", profiles: "comptes", story_highlights: "à la une", incidents: "incidents" };
const SERVICES = [
  ["app", "Application"],
  ["db", "Base de données"],
  ["storage", "Stockage"],
  ["video", "Vidéo"],
  ["notifications", "Notifications"],
  ["messaging", "Messagerie"],
];

/** Journal d'audit : filtres (acteur, action, type, période), pagination, export CSV ; incidents (admin). */
export function AuditJournal({ initial, filters, facets, incidents, isAdmin }: { initial: AuditEntry[]; filters: AuditFilters; facets: AuditFacets; incidents: IncidentRow[]; isAdmin: boolean }) {
  const [entries, setEntries] = useState(initial);
  const [hasMore, setHasMore] = useState(initial.length >= 50);
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [service, setService] = useState("app");
  const [note, setNote] = useState("");
  const router = useRouter();
  const toast = useToast();
  const query = new URLSearchParams(Object.entries({ acteur: filters.actor, action: filters.action, type: filters.entity, du: filters.from, au: filters.to }).filter(([, v]) => v) as [string, string][]).toString();

  function apply(next: Partial<Record<"acteur" | "action" | "type" | "du" | "au", string>>) {
    const params = new URLSearchParams(query);
    for (const [k, v] of Object.entries(next)) v ? params.set(k, v) : params.delete(k);
    router.push(`/studio/journal?${params.toString()}`);
  }
  function loadMore() {
    start(async () => {
      const page = await fetchAudit({ ...filters, cursor: entries[entries.length - 1]?.id ?? null });
      setEntries((prev) => [...prev, ...page]);
      setHasMore(page.length >= 50);
    });
  }

  return (
    <div className="mx-auto max-w-[960px] space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text-1">Journal</h1>
        <a href={`/studio/journal/export?${query}`} className="pressable rounded-[10px] bg-bg-2 px-3 py-2 text-[13px] font-medium text-text-1">
          Export CSV
        </a>
      </div>
      <p className="text-[13px] text-text-3">Chaque création, modification ou suppression faite depuis le studio est tracée avec son auteur. Les administrateurs voient tout, les éditeurs leurs propres actions.</p>

      <div className="grid gap-3 rounded-[16px] bg-bg-1 p-4 sm:grid-cols-5">
        <SelectField label="Acteur" name="acteur" value={filters.actor ?? ""} onChange={(e) => apply({ acteur: e.target.value })}>
          <option value="">Tous</option>
          {facets.actors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </SelectField>
        <SelectField label="Action" name="action" value={filters.action ?? ""} onChange={(e) => apply({ action: e.target.value })}>
          <option value="">Toutes</option>
          {Object.entries(ACTIONS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </SelectField>
        <SelectField label="Type" name="type" value={filters.entity ?? ""} onChange={(e) => apply({ type: e.target.value })}>
          <option value="">Tous</option>
          {facets.entities.map((e) => (
            <option key={e} value={e}>
              {ENTITIES[e] ?? e}
            </option>
          ))}
        </SelectField>
        <Field label="Du" name="du" type="date" value={filters.from ?? ""} onChange={(e) => apply({ du: e.target.value })} />
        <Field label="Au" name="au" type="date" value={filters.to ?? ""} onChange={(e) => apply({ au: e.target.value })} />
      </div>

      <div className="overflow-x-auto rounded-[16px] bg-bg-1">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead>
            <tr className="text-left text-text-3">
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-3 py-3 font-medium">Acteur</th>
              <th className="px-3 py-3 font-medium">Action</th>
              <th className="px-3 py-3 font-medium">Type</th>
              <th className="px-3 py-3 font-medium">Élément</th>
              <th className="px-5 py-3 font-medium">Champs</th>
            </tr>
          </thead>
          <tbody className="text-text-1">
            {entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-6 text-center text-text-2">
                  Aucune action sur cette période.
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id} className="border-t border-line">
                  <td className="whitespace-nowrap px-5 py-2.5 text-text-2">{formatDateTime(e.created_at)}</td>
                  <td className="px-3 py-2.5">{e.actor?.name ?? "Système"}</td>
                  <td className="px-3 py-2.5">{ACTIONS[e.action] ?? e.action}</td>
                  <td className="px-3 py-2.5 text-text-2">{ENTITIES[e.entity_type] ?? e.entity_type}</td>
                  <td className="max-w-[260px] truncate px-3 py-2.5">{e.summary ?? e.entity_id}</td>
                  <td className="max-w-[220px] truncate px-5 py-2.5 text-text-3">{e.changed.join(", ")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <Button type="button" variant="secondary" loading={pending} onClick={loadMore}>
          Afficher la suite
        </Button>
      )}

      <section className="space-y-3">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">Incidents</h2>
        <p className="text-[13px] text-text-3">Affichés sur la page « État des services » (/etat) pendant 90 jours.</p>
        <div className="hairline rounded-[16px] bg-bg-1">
          {incidents.length === 0 && <p className="px-5 py-4 text-[15px] text-text-2">Aucun incident déclaré.</p>}
          {incidents.map((i) => (
            <div key={i.id} className="flex items-start gap-3 px-5 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] text-text-1">{i.title}</span>
                <span className="block text-[13px] text-text-3">
                  {SERVICES.find(([k]) => k === i.service)?.[1] ?? i.service} · {formatDateTime(i.started_at)} {i.resolved_at ? `→ résolu ${formatDateTime(i.resolved_at)}` : "· en cours"}
                </span>
              </span>
              {isAdmin && !i.resolved_at && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await resolveIncident(i.id);
                      toast(r.ok ? "Incident résolu" : r.error);
                      router.refresh();
                    })
                  }
                >
                  Marquer résolu
                </Button>
              )}
            </div>
          ))}
        </div>
        {isAdmin && (
          <form
            className="space-y-3 rounded-[16px] bg-bg-1 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await declareIncident({ title, service, note });
                toast(r.ok ? "Incident déclaré" : r.error);
                if (r.ok) {
                  setTitle("");
                  setNote("");
                  router.refresh();
                }
              });
            }}
          >
            <h3 className="text-[15px] font-semibold text-text-1">Déclarer un incident</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Titre" name="incident_title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
              <SelectField label="Service" name="incident_service" value={service} onChange={(e) => setService(e.target.value)}>
                {SERVICES.map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </SelectField>
            </div>
            <TextareaField label="Note (facultatif)" name="incident_note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} />
            <Button type="submit" loading={pending} disabled={title.trim().length < 3}>
              Déclarer
            </Button>
          </form>
        )}
      </section>
    </div>
  );
}
