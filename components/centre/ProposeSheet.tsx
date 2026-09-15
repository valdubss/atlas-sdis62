"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { proposeCenterUpdate, proposeEvent, proposePost } from "@/app/(app)/centre/actions";
import { MediaUploader, type EditorMedia } from "@/components/studio/MediaUploader";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Field, TextareaField, CheckboxField } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";

type Mode = "text" | "photo" | "video" | "event" | "sheet";
const MODES: { key: Mode; label: string }[] = [
  { key: "text", label: "Actu" },
  { key: "photo", label: "Photos" },
  { key: "video", label: "Vidéo" },
  { key: "event", label: "Événement" },
  { key: "sheet", label: "Fiche" },
];

/**
 * Bouton flottant « Proposer » du référent et feuille de proposition :
 * actu (texte), photos, vidéo, événement, ou mise à jour de la fiche.
 * Chaque envoi crée une proposition en attente, validée par le service
 * communication ; l'auteur est prévenu du résultat.
 */
export function ProposeFab({ centerId, centerName }: { centerId: string; centerName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass-float pressable fixed bottom-[calc(max(env(safe-area-inset-bottom),12px)+72px)] right-4 z-30 flex h-12 items-center gap-2 rounded-full pl-4 pr-5 text-[15px] font-semibold text-text-1"
        aria-label={`Proposer une actualité pour ${centerName}`}
      >
        <Plus size={20} strokeWidth={2} aria-hidden="true" />
        Proposer
      </button>
      <ProposeSheet centerId={centerId} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function ProposeSheet({ centerId, open, onClose }: { centerId: string; open: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("text");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [media, setMedia] = useState<EditorMedia[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  // Événement
  const [allDay, setAllDay] = useState(false);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [location, setLocation] = useState("");
  // Fiche
  const [presentation, setPresentation] = useState("");
  const [cover, setCover] = useState<EditorMedia[]>([]);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const busy = media.some((m) => m.status !== "ready") || cover.some((m) => m.status !== "ready");

  function reset() {
    setTitle("");
    setBody("");
    setMedia([]);
    setFields({});
    setStartsAt("");
    setEndsAt("");
    setLocation("");
    setAllDay(false);
    setPresentation("");
    setCover([]);
  }

  function switchMode(next: Mode) {
    setMode(next);
    setFields({});
    if ((next === "photo" || next === "video") !== (mode === "photo" || mode === "video")) setMedia([]);
    if (next === "photo" && mode === "video") setMedia([]);
    if (next === "video" && mode === "photo") setMedia([]);
  }

  function submit() {
    start(async () => {
      setFields({});
      let r: { ok: true } | { ok: false; error: string; fields?: Record<string, string> };
      if (mode === "event") {
        r = await proposeEvent(centerId, { title, description: body, location, all_day: allDay, starts_at: startsAt, ends_at: endsAt });
      } else if (mode === "sheet") {
        r = await proposeCenterUpdate(centerId, { presentation, cover_media_id: cover.find((m) => m.status === "ready")?.id ?? "" });
      } else {
        r = await proposePost(centerId, { kind: mode, title, body, media: media.filter((m) => m.status === "ready").map((m) => m.id) });
      }
      if (!r.ok) {
        setFields(r.fields ?? {});
        toast(r.error);
        return;
      }
      toast(mode === "sheet" ? "Mise à jour proposée au service communication" : "Proposition envoyée. Vous serez prévenu de sa validation.");
      reset();
      onClose();
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onClose={onClose} title="Proposer" tall>
      <div className="space-y-4 px-5 pb-[max(env(safe-area-inset-bottom),20px)]">
        <div role="tablist" aria-label="Type de proposition" className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
          {MODES.map((m) => (
            <button key={m.key} type="button" role="tab" aria-selected={mode === m.key} onClick={() => switchMode(m.key)} className={cn("h-9 shrink-0 whitespace-nowrap rounded-full px-4 text-[13px] font-medium", mode === m.key ? "bg-red-soft text-text-1" : "bg-bg-1 text-text-2")}>
              {m.label}
            </button>
          ))}
        </div>

        {mode === "text" && (
          <>
            <Field label="Titre (facultatif)" name="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} error={fields.title} />
            <TextareaField label="Votre actu" name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={2000} placeholder="Ce qui s'est passé au centre, en quelques lignes." error={fields.body} />
          </>
        )}

        {(mode === "photo" || mode === "video") && (
          <>
            <MediaUploader accept={mode === "photo" ? "images" : "video"} items={media} onChange={setMedia} />
            {fields.media && <p className="text-[13px] text-red-text">{fields.media}</p>}
            <Field label="Titre (facultatif)" name="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} error={fields.title} />
            <TextareaField label="Légende (facultatif)" name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={2000} error={fields.body} />
          </>
        )}

        {mode === "event" && (
          <>
            <Field label="Titre" name="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} error={fields.title} required />
            <CheckboxField label="Toute la journée" name="all_day" checked={allDay} onChange={(e) => { setAllDay(e.target.checked); setStartsAt(""); setEndsAt(""); }} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Début" name="starts_at" type={allDay ? "date" : "datetime-local"} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} error={fields.starts_at} required />
              <Field label="Fin (facultatif)" name="ends_at" type={allDay ? "date" : "datetime-local"} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} error={fields.ends_at} min={startsAt || undefined} />
            </div>
            <Field label="Lieu (facultatif)" name="location" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={160} error={fields.location} />
            <TextareaField label="Description (facultatif)" name="description" value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={2000} error={fields.description} />
          </>
        )}

        {mode === "sheet" && (
          <>
            <p className="text-[13px] text-text-3">Proposez une nouvelle présentation ou une nouvelle photo de couverture. Le service communication l&apos;applique après relecture.</p>
            <TextareaField label="Présentation du centre (600 caractères)" name="presentation" value={presentation} onChange={(e) => setPresentation(e.target.value)} rows={5} maxLength={600} error={fields.presentation} />
            <MediaUploader accept="center_cover" items={cover} onChange={setCover} />
          </>
        )}

        <Button type="button" onClick={submit} loading={pending} disabled={busy} className="w-full">
          {busy ? "Médias en cours de traitement…" : "Envoyer la proposition"}
        </Button>
      </div>
    </Sheet>
  );
}
