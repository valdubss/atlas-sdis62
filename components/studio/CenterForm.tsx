"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addReferent, removeReferent, reviewCenterChange, saveCenter, searchAgents, type FormState } from "@/app/(studio)/studio/centres/actions";
import type { CenterChange, CenterWithRefs } from "@/lib/centres/queries";
import type { Grouping } from "@/lib/supabase/database.types";
import type { EditorMedia } from "@/components/studio/MediaUploader";
import { MediaUploader } from "@/components/studio/MediaUploader";
import { CENTER_TYPE_LABELS } from "@/lib/config";
import { CENTER_TYPES } from "@/lib/validation/center";
import { formatDateLong, formatDateTime } from "@/lib/format";
import { imageSrc } from "@/lib/media/url";
import { Field, SelectField, TextareaField, CheckboxField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";

const initial: FormState = { status: "idle" };
type Agent = { id: string; first_name: string; last_name: string; email: string; avatar_key: string | null; role: string };

/** Fiche d'un centre (Studio) : coordonnées, présentation, couverture, chef, référents. */
export function CenterForm({ center, groupings, notice }: { center: CenterWithRefs | null; groupings: Grouping[]; notice?: string | null }) {
  const [state, action, pending] = useActionState(saveCenter, initial);
  const fields = state.status === "error" ? state.fields ?? {} : {};
  const toast = useToast();
  const router = useRouter();
  const [cover, setCover] = useState<EditorMedia[]>(center?.cover ? [{ id: center.cover.id, kind: "image", variants: center.cover.variants, poster_key: null, width: null, height: null, alt: "", mime: "image/webp", original_key: "", status: "ready", progress: 1 }] : []);
  const [active, setActive] = useState(center?.is_active ?? true);
  const [chief, setChief] = useState<{ id: string; label: string } | null>(center?.chief ? { id: center.chief.id, label: `${center.chief.first_name} ${center.chief.last_name}` } : null);

  useEffect(() => {
    if (state.status === "saved") toast("Centre enregistré");
    if (state.status === "error" && !state.fields) toast(state.message);
  }, [state, toast]);

  const readyCover = cover.find((m) => m.status === "ready");

  return (
    <div className="mx-auto max-w-[960px] space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="min-w-0 text-[26px] font-semibold tracking-[-0.02em] text-text-1 sm:text-[28px]">{center ? center.name : "Nouveau centre"}</h1>
          {center && <Badge>{CENTER_TYPE_LABELS[center.type]}</Badge>}
        </div>
        <Link href="/studio/centres/referentiel" className="pressable hidden text-[15px] font-medium text-text-2 hover:text-text-1 sm:inline">
          Référentiel
        </Link>
      </div>
      {notice && (
        <p role="status" className="text-[15px] text-text-2">
          {notice}
        </p>
      )}

      {center && center.changes.length > 0 && <PendingUpdate center={center} />}

      <form action={action} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]" noValidate>
        {center && <input type="hidden" name="id" value={center.id} />}
        <input type="hidden" name="cover_media_id" value={readyCover?.id ?? ""} />
        <input type="hidden" name="chief_id" value={chief?.id ?? ""} />
        <input type="hidden" name="is_active" value={active ? "true" : "false"} />

        <div className="min-w-0 space-y-6">
          <section className="space-y-4 rounded-[16px] bg-bg-1 p-5">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
              <Field label="Nom" name="name" defaultValue={center?.name ?? ""} maxLength={120} placeholder="CIS Arras" error={fields.name} required />
              <SelectField label="Type" name="type" defaultValue={center?.type ?? "cis"}>
                {CENTER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {CENTER_TYPE_LABELS[t]}
                  </option>
                ))}
              </SelectField>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField label="Groupement" name="grouping_id" defaultValue={center?.grouping_id ?? ""}>
                <option value="">Aucun</option>
                {groupings.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </SelectField>
              <Field label="Identifiant d'adresse (slug)" name="slug" defaultValue={center?.slug ?? ""} maxLength={80} placeholder="généré depuis le nom si vide" error={fields.slug} hint="Apparaît dans l'adresse de la page : /centre/arras" />
            </div>
            <TextareaField label="Présentation (600 caractères)" name="presentation" defaultValue={center?.presentation ?? ""} maxLength={600} rows={4} error={fields.presentation} hint="Quelques lignes sur le centre, ses spécialités, son secteur." />
          </section>

          <section className="space-y-4 rounded-[16px] bg-bg-1 p-5">
            <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">Coordonnées</h2>
            <Field label="Adresse" name="address" defaultValue={center?.address ?? ""} maxLength={200} error={fields.address} />
            <div className="grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)]">
              <Field label="Code postal" name="postal_code" defaultValue={center?.postal_code ?? ""} maxLength={10} inputMode="numeric" error={fields.postal_code} />
              <Field label="Ville" name="city" defaultValue={center?.city ?? ""} maxLength={80} error={fields.city} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Téléphone" name="phone" defaultValue={center?.phone ?? ""} maxLength={30} inputMode="tel" error={fields.phone} />
              <Field label="E-mail" name="email" defaultValue={center?.email ?? ""} maxLength={160} inputMode="email" error={fields.email} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Latitude" name="lat" defaultValue={center?.lat ?? ""} inputMode="decimal" placeholder="50.2910" error={fields.lat} hint="Remplie par le script d'import (géocodage), ou à la main." />
              <Field label="Longitude" name="lng" defaultValue={center?.lng ?? ""} inputMode="decimal" placeholder="2.7775" error={fields.lng} />
            </div>
          </section>

          <section className="space-y-4 rounded-[16px] bg-bg-1 p-5">
            <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">Chef de centre</h2>
            <AgentPicker label="Chef de centre" value={chief} onChange={setChief} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Effectif affiché (facultatif)" name="displayed_headcount" defaultValue={center?.displayed_headcount ?? ""} inputMode="numeric" error={fields.displayed_headcount} hint="Laissez vide pour ne rien afficher." />
              <Field label="Ordre d'affichage" name="sort_order" type="number" defaultValue={center?.sort_order ?? 0} error={fields.sort_order} />
            </div>
            <CheckboxField label="Centre actif" name="is_active_toggle" checked={active} onChange={(e) => setActive(e.target.checked)} hint="Un centre inactif n'apparaît plus dans l'annuaire ni au rattachement" />
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={pending}>
              Enregistrer
            </Button>
            {center && (
              <Link href={`/centre/${center.slug}`} className="pressable text-[15px] font-medium text-text-2 hover:text-text-1">
                Voir la page du centre
              </Link>
            )}
          </div>
        </div>

        <aside className="min-w-0 space-y-6">
          <section className="space-y-3 rounded-[16px] bg-bg-1 p-5">
            <MediaUploader accept="center_cover" items={cover} onChange={setCover} />
          </section>
          {center && <ReferentsEditor center={center} onChanged={() => router.refresh()} />}
        </aside>
      </form>
    </div>
  );
}

/** Recherche d'un agent par nom ou e-mail. */
function AgentPicker({ label, value, onChange }: { label: string; value: { id: string; label: string } | null; onChange: (v: { id: string; label: string } | null) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Agent[]>([]);
  const [searching, start] = useTransition();
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => start(async () => setResults(await searchAgents(q))), 200);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="space-y-2">
      <p className="text-[13px] font-medium text-text-2">{label}</p>
      {value ? (
        <div className="flex items-center gap-3 rounded-[10px] bg-bg-2 px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-[15px] text-text-1">{value.label}</span>
          <button type="button" onClick={() => onChange(null)} className="text-[13px] text-text-3 hover:text-red-text">
            Retirer
          </button>
        </div>
      ) : (
        <div className="relative">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un agent (nom, e-mail)" aria-label={label} className="block h-11 w-full rounded-[10px] bg-bg-2 px-3.5 text-[15px] text-text-1 outline-none ring-1 ring-transparent focus:ring-glass-edge" />
          {(results.length > 0 || searching) && (
            <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-[12px] bg-bg-2 shadow-float">
              {results.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange({ id: a.id, label: `${a.first_name} ${a.last_name}`.trim() || a.email });
                      setQ("");
                      setResults([]);
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-bg-1"
                  >
                    <Avatar name={`${a.first_name} ${a.last_name}`} avatarKey={a.avatar_key} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] text-text-1">{`${a.first_name} ${a.last_name}`.trim() || a.email}</span>
                      <span className="block truncate text-[12px] text-text-3">{a.email}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Référents communication du centre : ajout, retrait, historique. */
function ReferentsEditor({ center, onChanged }: { center: CenterWithRefs; onChanged: () => void }) {
  const [pick, setPick] = useState<{ id: string; label: string } | null>(null);
  const [pending, start] = useTransition();
  const [showHistory, setShowHistory] = useState(false);
  const toast = useToast();
  const active = center.referents.filter((r) => r.is_active);
  const history = center.referents.filter((r) => !r.is_active);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    start(async () => {
      const r = await fn();
      toast(r.ok ? ok : (r.error ?? "Erreur"));
      if (r.ok) {
        setPick(null);
        onChanged();
      }
    });
  }

  return (
    <section className="space-y-3 rounded-[16px] bg-bg-1 p-5">
      <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">
        Référents communication <span className="text-text-3">{active.length}</span>
      </h2>
      <p className="text-[13px] text-text-3">Un référent propose des actus, photos et événements pour ce centre ; la publication reste soumise à votre validation.</p>
      <ul className="space-y-2">
        {active.map((r) => (
          <li key={r.id} className="flex items-center gap-3">
            <Avatar name={r.profile ? `${r.profile.first_name} ${r.profile.last_name}` : null} avatarKey={r.profile?.avatar_key} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] text-text-1">{r.profile ? `${r.profile.first_name} ${r.profile.last_name}` : "Agent supprimé"}</span>
              <span className="block text-[12px] text-text-3">depuis le {formatDateLong(r.since)}</span>
            </span>
            <button type="button" disabled={pending} onClick={() => confirm("Retirer ce référent ?") && run(() => removeReferent(r.id), "Référent retiré")} className="text-[13px] text-text-3 hover:text-red-text">
              Retirer
            </button>
          </li>
        ))}
        {active.length === 0 && <li className="text-[15px] text-text-2">Aucun référent désigné.</li>}
      </ul>
      <AgentPicker label="Ajouter un référent" value={pick} onChange={setPick} />
      {pick && (
        <Button type="button" variant="secondary" size="md" disabled={pending} onClick={() => run(() => addReferent(center.id, pick.id), "Référent ajouté")}>
          Désigner {pick.label}
        </Button>
      )}
      {history.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowHistory((v) => !v)} className="text-[13px] font-medium text-text-2 hover:text-text-1">
            {showHistory ? "Masquer l'historique" : `Historique (${history.length})`}
          </button>
          {showHistory && (
            <ul className="mt-2 space-y-1 text-[13px] text-text-3">
              {history.map((r) => (
                <li key={r.id}>
                  {r.profile ? `${r.profile.first_name} ${r.profile.last_name}` : "Agent supprimé"} · du {formatDateLong(r.since)} au {formatDateLong(r.ended_at)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

const FIELD_LABELS: Record<string, string> = { presentation: "Présentation", cover_media_id: "Photo de couverture", phone: "Téléphone", email: "E-mail", address: "Adresse", displayed_headcount: "Effectif affiché" };

/** Modifications proposées par les référents : décision champ par champ, puis historique. */
function PendingUpdate({ center }: { center: CenterWithRefs }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const router = useRouter();
  const toast = useToast();
  const open = center.changes.filter((c) => c.decision === "pending");
  const past = center.changes.filter((c) => c.decision !== "pending").slice(0, 10);
  const value = (c: CenterChange, v: string | null) => (v === null ? "—" : c.field === "cover_media_id" ? "photo" : v);
  const decide = (id: string, accept: boolean) =>
    start(async () => {
      const r = await reviewCenterChange(id, accept, note);
      toast(r.ok ? (accept ? "Modification appliquée" : "Proposition écartée") : r.error);
      setNote("");
      router.refresh();
    });
  return (
    <section className={cn("space-y-3 rounded-[16px] bg-bg-1 p-5", open.length > 0 && "ring-1 ring-red/40")}>
      <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">
        Modifications proposées {open.length > 0 && <span className="text-text-3">{open.length}</span>}
      </h2>
      {open.length === 0 && <p className="text-[13px] text-text-3">Aucune proposition en attente.</p>}
      {open.map((c) => (
        <div key={c.id} className="space-y-2 rounded-[12px] bg-bg-2 px-3 py-2.5">
          <p className="text-[13px] text-text-3">
            {FIELD_LABELS[c.field] ?? c.field} · {c.proposer ? `${c.proposer.first_name} ${c.proposer.last_name}` : "Référent"} · {formatDateTime(c.proposed_at)}
          </p>
          <p className="whitespace-pre-line text-[15px] text-text-1">
            <span className="text-text-3 line-through">{value(c, c.old_value)}</span> → {value(c, c.new_value)}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={pending} onClick={() => decide(c.id, true)}>
              Accepter
            </Button>
            <Button variant="danger" size="sm" disabled={pending} onClick={() => decide(c.id, false)}>
              Écarter
            </Button>
          </div>
        </div>
      ))}
      {open.length > 0 && <Field label="Message au référent (facultatif, joint à la prochaine décision)" name="change_note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />}
      {past.length > 0 && (
        <details className="text-[13px] text-text-3">
          <summary className="cursor-pointer">Historique ({past.length})</summary>
          <ul className="mt-2 space-y-1">
            {past.map((c) => (
              <li key={c.id}>
                {formatDateTime(c.decided_at ?? c.proposed_at)} · {FIELD_LABELS[c.field] ?? c.field} · {c.decision === "accepted" ? "acceptée" : "écartée"}
                {c.note && ` — ${c.note}`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export function coverPreview(center: CenterWithRefs | null) {
  return center?.cover ? imageSrc({ ...center.cover, kind: "image", poster_key: null, width: null, height: null, alt: "", mime: "image/webp", original_key: "" }, "small") : null;
}
