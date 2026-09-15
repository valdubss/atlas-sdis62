"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { saveService, searchAgents, type FormState } from "@/app/(studio)/studio/centres/actions";
import type { Grouping, Service } from "@/lib/supabase/database.types";
import type { PersonRef } from "@/lib/centres/queries";
import { Field, SelectField, TextareaField, CheckboxField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";

const initial: FormState = { status: "idle" };

/** Fiche d'un service de direction (Studio). */
export function ServiceForm({ service, groupings, notice }: { service: (Service & { manager: PersonRef | null }) | null; groupings: Grouping[]; notice?: string | null }) {
  const [state, action, pending] = useActionState(saveService, initial);
  const fields = state.status === "error" ? state.fields ?? {} : {};
  const toast = useToast();
  const [active, setActive] = useState(service?.is_active ?? true);
  const [manager, setManager] = useState<{ id: string; label: string } | null>(service?.manager ? { id: service.manager.id, label: `${service.manager.first_name} ${service.manager.last_name}` } : null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; first_name: string; last_name: string; email: string; avatar_key: string | null }[]>([]);
  const [, start] = useTransition();

  useEffect(() => {
    if (state.status === "saved") toast("Service enregistré");
    if (state.status === "error" && !state.fields) toast(state.message);
  }, [state, toast]);
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => start(async () => setResults(await searchAgents(q))), 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="mx-auto max-w-[760px] space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 text-[26px] font-semibold tracking-[-0.02em] text-text-1 sm:text-[28px]">{service ? service.name : "Nouveau service"}</h1>
        <Link href="/studio/centres/referentiel" className="pressable hidden text-[15px] font-medium text-text-2 hover:text-text-1 sm:inline">
          Référentiel
        </Link>
      </div>
      {notice && (
        <p role="status" className="text-[15px] text-text-2">
          {notice}
        </p>
      )}
      <form action={action} className="space-y-6" noValidate>
        {service && <input type="hidden" name="id" value={service.id} />}
        <input type="hidden" name="manager_id" value={manager?.id ?? ""} />
        <input type="hidden" name="is_active" value={active ? "true" : "false"} />
        <section className="space-y-4 rounded-[16px] bg-bg-1 p-5">
          <Field label="Nom" name="name" defaultValue={service?.name ?? ""} maxLength={120} placeholder="Service ressources humaines" error={fields.name} required />
          <Field label="Description courte (une ligne)" name="short_description" defaultValue={service?.short_description ?? ""} maxLength={140} placeholder="Carrières, paie, dossiers SPV" error={fields.short_description} />
          <TextareaField label="Mission (Markdown court)" name="mission" defaultValue={service?.mission ?? ""} maxLength={2000} rows={5} error={fields.mission} />
          <TextareaField label="Pour quoi les contacter (3 lignes maximum)" name="contact_reasons" defaultValue={(service?.contact_reasons ?? []).join("\n")} rows={3} error={fields.contact_reasons} hint="Une raison par ligne : « Convention de disponibilité », « Indemnités », « Dossiers SPV »." />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Groupement (facultatif)" name="grouping_id" defaultValue={service?.grouping_id ?? ""}>
              <option value="">Aucun</option>
              {groupings.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </SelectField>
            <Field label="Identifiant d'adresse (slug)" name="slug" defaultValue={service?.slug ?? ""} maxLength={80} placeholder="généré depuis le nom si vide" error={fields.slug} />
          </div>
        </section>
        <section className="space-y-4 rounded-[16px] bg-bg-1 p-5">
          <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">Contact</h2>
          <div className="space-y-2">
            <p className="text-[13px] font-medium text-text-2">Responsable</p>
            {manager ? (
              <div className="flex items-center gap-3 rounded-[10px] bg-bg-2 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-[15px] text-text-1">{manager.label}</span>
                <button type="button" onClick={() => setManager(null)} className="text-[13px] text-text-3 hover:text-red-text">
                  Retirer
                </button>
              </div>
            ) : (
              <div className="relative">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un agent (nom, e-mail)" aria-label="Responsable" className="block h-11 w-full rounded-[10px] bg-bg-2 px-3.5 text-[15px] text-text-1 outline-none ring-1 ring-transparent focus:ring-glass-edge" />
                {results.length > 0 && (
                  <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-[12px] bg-bg-2 shadow-float">
                    {results.map((a) => (
                      <li key={a.id}>
                        <button type="button" onClick={() => { setManager({ id: a.id, label: `${a.first_name} ${a.last_name}`.trim() || a.email }); setQ(""); setResults([]); }} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-bg-1">
                          <Avatar name={`${a.first_name} ${a.last_name}`} avatarKey={a.avatar_key} size="sm" />
                          <span className="min-w-0 flex-1 truncate text-[15px] text-text-1">{`${a.first_name} ${a.last_name}`.trim() || a.email}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Téléphone" name="phone" defaultValue={service?.phone ?? ""} maxLength={30} inputMode="tel" error={fields.phone} />
            <Field label="E-mail" name="email" defaultValue={service?.email ?? ""} maxLength={160} inputMode="email" error={fields.email} />
          </div>
          <Field label="Adresse" name="address" defaultValue={service?.address ?? ""} maxLength={200} error={fields.address} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ordre d'affichage" name="sort_order" type="number" defaultValue={service?.sort_order ?? 0} error={fields.sort_order} />
            <div className="pt-6">
              <CheckboxField label="Service actif" name="is_active_toggle" checked={active} onChange={(e) => setActive(e.target.checked)} />
            </div>
          </div>
        </section>
        <Button type="submit" loading={pending}>
          Enregistrer
        </Button>
      </form>
    </div>
  );
}
