"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteEvent, saveEvent, type EventFormState } from "@/app/(studio)/studio/agenda/actions";
import type { EventItem } from "@/lib/agenda/queries";
import { toLocalInput } from "@/lib/time";
import { Field, TextareaField, SelectField, CheckboxField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";

const initial: EventFormState = { status: "idle" };
type PostRef = { id: string; slug: string; title: string | null };

/** Éditeur d'événement : titre, dates (heure de Paris), lieu, description, publication liée. */
export function EventEditor({ event, posts }: { event: EventItem | null; posts: PostRef[] }) {
  const [state, action, pending] = useActionState(saveEvent, initial);
  const [deleting, startDelete] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const fields = state.status === "error" ? state.fields ?? {} : {};

  const [allDay, setAllDay] = useState(event?.all_day ?? false);
  const [published, setPublished] = useState(event ? event.status === "published" : true);
  const [startsAt, setStartsAt] = useState(event ? (event.all_day ? toLocalInput(event.starts_at).slice(0, 10) : toLocalInput(event.starts_at)) : "");
  const [endsAt, setEndsAt] = useState(event?.ends_at ? (event.all_day ? toLocalInput(event.ends_at).slice(0, 10) : toLocalInput(event.ends_at)) : "");

  function toggleAllDay(next: boolean) {
    setAllDay(next);
    // Conserver la date saisie en changeant seulement la précision
    setStartsAt((s) => (next ? s.slice(0, 10) : s ? `${s.slice(0, 10)}T09:00` : s));
    setEndsAt((s) => (next ? s.slice(0, 10) : s ? `${s.slice(0, 10)}T17:00` : s));
  }

  return (
    <div className="mx-auto max-w-[720px]">
      <form action={action} className="min-w-0 space-y-6">
        {event && <input type="hidden" name="id" value={event.id} />}
        <input type="hidden" name="all_day" value={allDay ? "true" : "false"} />
        <input type="hidden" name="status" value={published ? "published" : "draft"} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="min-w-0 text-[26px] font-semibold tracking-[-0.02em] text-text-1 sm:text-[28px]">{event ? "Modifier l'événement" : "Nouvel événement"}</h1>
            <Badge tone={published ? "success" : "neutral"}>{published ? "Visible" : "Brouillon"}</Badge>
          </div>
          <Link href="/studio/agenda" className="pressable hidden text-[15px] font-medium text-text-2 hover:text-text-1 sm:inline">
            Agenda
          </Link>
        </div>

        {state.status === "error" && (
          <p role="alert" className="rounded-[12px] bg-red-soft px-4 py-3 text-[15px] text-red-text">
            {state.message}
          </p>
        )}

        <section className="space-y-4 rounded-[16px] bg-bg-1 p-5">
          <Field label="Titre" name="title" defaultValue={event?.title ?? ""} maxLength={120} placeholder="Cérémonie de la Sainte-Barbe" error={fields.title} required />
          <Field label="Lieu (facultatif)" name="location" defaultValue={event?.location ?? ""} maxLength={160} placeholder="Centre de secours d'Arras" error={fields.location} />
          <TextareaField label="Description (facultatif)" name="description" defaultValue={event?.description ?? ""} maxLength={2000} rows={5} error={fields.description} hint="Programme, consignes, tenue… Les retours à la ligne sont conservés." />
        </section>

        <section className="hairline rounded-[16px] bg-bg-1 [&>*]:px-5">
          <div className="py-2">
            <CheckboxField label="Toute la journée" name="all_day_toggle" checked={allDay} onChange={(e) => toggleAllDay(e.target.checked)} />
          </div>
          <div className="grid gap-4 py-4 sm:grid-cols-2">
            <Field label="Début" name="starts_at" type={allDay ? "date" : "datetime-local"} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} error={fields.starts_at} required />
            <Field label="Fin (facultatif)" name="ends_at" type={allDay ? "date" : "datetime-local"} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} error={fields.ends_at} min={startsAt || undefined} />
          </div>
          <div className="py-3">
            <SelectField label="Publication liée (facultatif)" name="post_id" defaultValue={event?.post?.id ?? ""} hint="Un lien « Voir la publication » apparaît dans le détail de l'événement.">
              <option value="">Aucune</option>
              {posts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title ?? p.slug}
                </option>
              ))}
            </SelectField>
          </div>
          <div className="py-2">
            <CheckboxField label="Visible par les agents" name="published_toggle" checked={published} onChange={(e) => setPublished(e.target.checked)} hint="Décoché : l'événement reste un brouillon du Studio" />
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={pending}>
            {published ? "Enregistrer et publier" : "Enregistrer le brouillon"}
          </Button>
          {event && (
            <Button
              type="button"
              variant="danger"
              disabled={deleting}
              onClick={() => {
                if (!confirm("Supprimer cet événement ?")) return;
                startDelete(async () => {
                  const r = await deleteEvent(event.id);
                  if (!r.ok) {
                    toast(r.error);
                    return;
                  }
                  router.push("/studio/agenda?ok=supprime");
                });
              }}
            >
              Supprimer
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
