"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { endFlash, sendFlash, type FlashFormState } from "@/app/(studio)/studio/flash/actions";
import type { FlashItem } from "@/lib/flash/queries";
import { formatDateTime } from "@/lib/format";
import { Field, SelectField, TextareaField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";

const initial: FlashFormState = { status: "idle" };
const DURATIONS: [string, string][] = [["2", "2 heures"], ["6", "6 heures"], ["12", "12 heures"], ["24", "24 heures"], ["48", "2 jours"], ["72", "3 jours"], ["custom", "Jusqu'à une date précise"]];

/** Studio → Flash : envoi d'un message prioritaire et liste des flashs récents. */
export function FlashPanel({ flashes }: { flashes: FlashItem[] }) {
  const [state, action, pending] = useActionState(sendFlash, initial);
  const [ending, startEnd] = useTransition();
  const [level, setLevel] = useState<"urgent" | "info">("urgent");
  const [duration, setDuration] = useState("6");
  const toast = useToast();
  const fields = state.status === "error" ? state.fields ?? {} : {};
  const now = Date.now();

  useEffect(() => {
    if (state.status === "sent") toast("Flash envoyé à tous les agents");
  }, [state, toast]);

  return (
    <div className="mx-auto max-w-[960px] space-y-8">
      <div>
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text-1">Flash</h1>
        <p className="mt-1 text-[15px] text-text-2">
          Un message prioritaire, affiché en tête du fil et envoyé en notification à <strong className="text-text-1">tous les agents abonnés</strong>, même ceux qui ont coupé les notifications de publication. À réserver aux consignes importantes.
        </p>
      </div>

      <form action={action} key={state.status === "sent" ? "sent" : "form"} className="space-y-4 rounded-[16px] bg-bg-1 p-5">
        <input type="hidden" name="level" value={level} />
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-text-2">Niveau</legend>
          <div className="flex gap-2">
            {(["urgent", "info"] as const).map((l) => (
              <button key={l} type="button" onClick={() => setLevel(l)} className={cn("h-9 rounded-full px-4 text-[13px] font-medium", level === l ? (l === "urgent" ? "bg-red-fill text-white" : "bg-navy text-white") : "bg-bg-2 text-text-2")}>
                {l === "urgent" ? "Urgent (rouge)" : "Information (bleu)"}
              </button>
            ))}
          </div>
        </fieldset>
        <Field label="Titre" name="title" maxLength={120} placeholder="Vigilance orange orages cet après-midi" error={fields.title} required />
        <TextareaField label="Message (facultatif)" name="body" maxLength={600} rows={3} placeholder="Consignes, horaires, contact…" error={fields.body} />
        <Field label="Lien (facultatif)" name="url" maxLength={300} placeholder="/post/… ou https://…" error={fields.url} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Affiché pendant" name="duration" value={duration} onChange={(e) => setDuration(e.target.value)}>
            {DURATIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </SelectField>
          {duration === "custom" && <Field label="Fin" name="ends_at" type="datetime-local" error={fields.ends_at} required />}
        </div>
        {state.status === "error" && (
          <p role="alert" className="text-[15px] text-red-text">
            {state.message}
          </p>
        )}
        <Button type="submit" loading={pending}>
          Envoyer le flash
        </Button>
      </form>

      <section className="space-y-3">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">Flashs récents</h2>
        <div className="hairline rounded-[16px] bg-bg-1">
          {flashes.length === 0 ? (
            <p className="px-5 py-6 text-[15px] text-text-2">Aucun flash envoyé ces 30 derniers jours.</p>
          ) : (
            flashes.map((f) => {
              const active = !f.deleted_at && new Date(f.ends_at).getTime() > now && new Date(f.starts_at).getTime() <= now;
              return (
                <div key={f.id} className="flex items-start gap-4 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] text-text-1">{f.title}</p>
                    <p className="text-[13px] text-text-3">
                      {formatDateTime(f.created_at)} · {active ? `jusqu'au ${formatDateTime(f.ends_at)}` : `terminé le ${formatDateTime(f.ends_at)}`}
                    </p>
                  </div>
                  <Badge tone={f.level === "urgent" ? "red" : "navy"}>{f.level === "urgent" ? "Urgent" : "Info"}</Badge>
                  {active && (
                    <button
                      type="button"
                      disabled={ending}
                      onClick={() =>
                        startEnd(async () => {
                          const r = await endFlash(f.id);
                          toast(r.ok ? "Flash retiré" : r.error);
                        })
                      }
                      className="text-[13px] font-medium text-text-2 hover:text-text-1"
                    >
                      Retirer
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
