"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, Search, X } from "lucide-react";
import type { DirectoryPerson } from "@/lib/messages/types";
import { groupDirectory, MESSAGE_LIMITS } from "@/lib/messages/helpers";
import { createGroup, messagingDirectory } from "@/app/(app)/messages/actions";
import { signMessageUpload } from "@/app/(app)/messages/media-actions";
import { uploadWithProgress } from "@/lib/media/client";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { CheckboxField, Field } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { toDatetimeLocal } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Création d'un groupe en deux écrans : 1) membres (recherche, jetons, listes
 * Service communication / Référents par groupement / Autres personnels),
 * 2) informations (photo carrée, nom 40, objet 120, date de fin, médias autorisés).
 */
export function NewGroupFlow({ initialPeople }: { initialPeople: DirectoryPerson[] }) {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [people, setPeople] = useState(initialPeople);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<DirectoryPerson[]>([]);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [mediaOk, setMediaOk] = useState(true);
  const [photo, setPhoto] = useState<{ key: string; url: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, start] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => messagingDirectory(q.trim() || null).then(setPeople).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [q]);

  const groups = useMemo(() => groupDirectory(people), [people]);
  const isSelected = (id: string) => selected.some((p) => p.id === id);
  const toggle = (p: DirectoryPerson) => setSelected((prev) => (isSelected(p.id) ? prev.filter((x) => x.id !== p.id) : [...prev, p]));

  async function onPhoto(file: File) {
    setUploading(true);
    try {
      // Photo recadrée en carré 512 px sur l'appareil
      const bitmap = await createImageBitmap(file);
      const side = Math.min(bitmap.width, bitmap.height);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 512;
      canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 512, 512);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", 0.85));
      if (!blob) throw new Error("Image illisible.");
      // La photo est signée sur le canal général (dossier messages/), puis rattachée au groupe créé
      const signed = await signMessageUpload({ channel_id: "00000000-0000-0000-0000-000000000000", kind: "photo", mime: "image/webp", size: blob.size });
      if (!signed.ok) throw new Error(signed.error);
      await uploadWithProgress(signed.url, signed.headers, blob, () => {});
      setPhoto({ key: signed.key, url: URL.createObjectURL(blob) });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Photo impossible.");
    } finally {
      setUploading(false);
    }
  }

  function submit() {
    start(async () => {
      const r = await createGroup({ name, subject, photo_key: photo?.key ?? null, ends_at: endsAt ? new Date(endsAt).toISOString() : null, members_can_post_media: mediaOk, member_ids: selected.map((p) => p.id) });
      if (!r.ok) {
        toast(r.error);
        return;
      }
      toast("Groupe créé");
      router.replace(`/messages/${r.id}`);
    });
  }

  if (step === 1) {
    return (
      <div className="space-y-4">
        <label className="relative block">
          <Search size={18} strokeWidth={1.75} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-3" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une personne" aria-label="Rechercher une personne" className="h-11 w-full rounded-[12px] bg-bg-1 pl-10 pr-3 text-[15px] text-text-1 outline-none placeholder:text-text-3" />
        </label>
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-2" aria-label="Membres choisis">
            {selected.map((p) => (
              <button key={p.id} type="button" onClick={() => toggle(p)} className="flex h-8 items-center gap-1.5 rounded-full bg-bg-2 pl-1 pr-2.5 text-[13px] font-medium text-text-1" aria-label={`Retirer ${p.first_name} ${p.last_name}`}>
                <Avatar name={`${p.first_name} ${p.last_name}`} avatarKey={p.avatar_key} size="sm" className="!h-6 !w-6 !text-[9px]" />
                {p.first_name}
                <X size={14} strokeWidth={1.75} aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
        {groups.length === 0 ? (
          <p className="px-1 py-6 text-center text-[15px] text-text-2">Aucune personne trouvée.</p>
        ) : (
          groups.map((g) => (
            <section key={g.title} className="space-y-1.5">
              <h2 className="px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-text-3">{g.title}</h2>
              <ul className="hairline overflow-hidden rounded-[16px] bg-bg-1">
                {g.people.map((p) => {
                  const on = isSelected(p.id);
                  return (
                    <li key={p.id}>
                      <button type="button" onClick={() => toggle(p)} aria-pressed={on} className="pressable flex w-full items-center gap-3 px-4 py-2.5 text-left">
                        <Avatar name={`${p.first_name} ${p.last_name}`} avatarKey={p.avatar_key} size="md" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] text-text-1">
                            {p.first_name} {p.last_name}
                          </span>
                          <span className="block truncate text-[13px] text-text-3">{[p.center, p.is_referent ? "Référent" : null].filter(Boolean).join(" · ")}</span>
                        </span>
                        <span className={cn("flex h-6 w-6 items-center justify-center rounded-full border", on ? "border-text-1 bg-text-1 text-bg-0" : "border-line text-transparent")} aria-hidden="true">
                          <Check size={14} strokeWidth={2.2} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
        <div className="sticky bottom-[calc(max(env(safe-area-inset-bottom),12px)+72px)] flex justify-end">
          <Button type="button" disabled={selected.length === 0} onClick={() => setStep(2)}>
            Suivant ({selected.length})
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex items-center gap-4">
        <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading} aria-label="Photo du groupe" className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[18px] bg-bg-1 text-text-3">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- aperçu local
            <img src={photo.url} alt="" className="h-full w-full object-cover" />
          ) : (
            <Camera size={24} strokeWidth={1.75} aria-hidden="true" />
          )}
        </button>
        <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onPhoto(e.target.files[0])} />
        <div className="min-w-0 flex-1">
          <Field label="Nom du groupe" name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={MESSAGE_LIMITS.groupNameMax} placeholder="Journée portes ouvertes 2026" required />
          <p className="mt-1 text-right text-[12px] tabular-nums text-text-4">
            {name.length}/{MESSAGE_LIMITS.groupNameMax}
          </p>
        </div>
      </div>
      <Field label="Objet du groupe" name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={MESSAGE_LIMITS.subjectMax} placeholder="Préparer la communication de l'événement" hint="Obligatoire : ce que le groupe sert à faire." required />
      <Field label="Fin du groupe (facultatif)" name="ends_at" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} min={toDatetimeLocal(new Date(Date.now() + 3_600_000).toISOString())} hint="Rappel 48 h avant, puis lecture seule et archivage automatique." className="max-w-xs" />
      <CheckboxField label="Les membres peuvent envoyer des photos, vidéos et fichiers" name="media_ok" checked={mediaOk} onChange={(e) => setMediaOk(e.target.checked)} />
      <p className="text-[13px] text-text-3">
        {selected.length} membre{selected.length > 1 ? "s" : ""} : {selected.map((p) => p.first_name).join(", ")}
      </p>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={pending} disabled={uploading || !name.trim() || !subject.trim()}>
          Créer le groupe
        </Button>
        <Button type="button" variant="secondary" onClick={() => setStep(1)}>
          Retour aux membres
        </Button>
      </div>
    </form>
  );
}
