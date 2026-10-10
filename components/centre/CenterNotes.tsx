"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Lock, MoreHorizontal, Pin, Plus } from "lucide-react";
import type { CenterNote } from "@/lib/centres/notes";
import { NOTE_ROLE_LABELS } from "@/lib/centres/notes";
import { deleteNote, pinNote } from "@/app/(app)/centre/notes-actions";
import { mediaUrl } from "@/lib/media/url";
import { formatDateLong } from "@/lib/format";
import { Avatar } from "@/components/ui/Avatar";
import { Sheet } from "@/components/ui/Sheet";
import { Lightbox } from "@/components/feed/Lightbox";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/Confirm";
import { NoteComposer } from "./NoteComposer";
import { cn } from "@/lib/cn";

type Tab = "actus" | "notes";

function seenKey(centerId: string) {
  return `atlas:notes-seen:${centerId}`;
}

/**
 * Deux fils sur la page d'un centre : « Actus » (propositions validées par le
 * service communication, visibles de tous) et « Notes de service » (fil interne
 * réservé aux membres : documents publiés directement par le chef de centre,
 * le responsable communication et le service communication).
 */
export function CenterFeeds({
  centerId,
  centerName,
  notes,
  canSeeNotes,
  canManage,
  initialTab,
  children,
}: {
  centerId: string;
  centerName: string;
  notes: CenterNote[];
  /** Membre du centre ou responsable : l'onglet « Notes de service » est proposé */
  canSeeNotes: boolean;
  canManage: boolean;
  initialTab: Tab;
  /** Fil « Actus » rendu côté serveur */
  children: React.ReactNode;
}) {
  const [tab, setTab] = useState<Tab>(canSeeNotes ? initialTab : "actus");
  const [composing, setComposing] = useState(false);
  // Notes nouvelles depuis la dernière visite (sur cet appareil) : pastille sur l'onglet et sur les notes
  const [seenAt, setSeenAt] = useState<string | null>(null);
  useEffect(() => {
    try {
      setSeenAt(localStorage.getItem(seenKey(centerId)) ?? "1970-01-01T00:00:00.000Z");
    } catch {
      setSeenAt("1970-01-01T00:00:00.000Z");
    }
  }, [centerId]);
  const freshIds = useMemo(() => new Set(seenAt ? notes.filter((n) => n.published_at > seenAt).map((n) => n.id) : []), [notes, seenAt]);
  useEffect(() => {
    if (tab !== "notes" || seenAt === null) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(seenKey(centerId), new Date().toISOString());
      } catch {}
    }, 1500);
    return () => clearTimeout(t);
  }, [tab, seenAt, centerId]);

  function select(next: Tab) {
    setTab(next);
    try {
      const url = new URL(window.location.href);
      if (next === "notes") url.searchParams.set("onglet", "notes");
      else url.searchParams.delete("onglet");
      window.history.replaceState(window.history.state, "", url.toString());
    } catch {}
  }

  return (
    <section className="space-y-3">
      {canSeeNotes ? (
        <div className="flex items-center justify-between gap-3 px-1">
          <div role="tablist" aria-label="Fils du centre" className="flex rounded-full bg-bg-1 p-1">
            {(["actus", "notes"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => select(t)}
                className={cn("relative h-9 rounded-full px-4 text-[14px] font-medium transition-colors", tab === t ? "bg-bg-2 text-text-1" : "text-text-2 hover:text-text-1")}
              >
                {t === "actus" ? "Actus" : "Notes de service"}
                {t === "notes" && freshIds.size > 0 && (
                  <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-fill px-1.5 text-[11px] font-semibold text-white" aria-label={`${freshIds.size} nouvelles`}>
                    {freshIds.size}
                  </span>
                )}
              </button>
            ))}
          </div>
          {tab === "notes" && canManage && (
            <button type="button" onClick={() => setComposing(true)} className="pressable flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-red-fill pl-3 pr-4 text-[14px] font-semibold text-white">
              <Plus size={18} strokeWidth={2.25} aria-hidden="true" />
              Publier
            </button>
          )}
        </div>
      ) : (
        <h2 className="px-1 text-[17px] font-semibold tracking-[-0.02em] text-text-1">Actus du centre</h2>
      )}

      {tab === "actus" ? children : <NotesList notes={notes} canManage={canManage} freshIds={freshIds} centerName={centerName} onCompose={() => setComposing(true)} />}

      {canManage && <NoteComposer centerId={centerId} centerName={centerName} open={composing} onClose={() => setComposing(false)} />}
    </section>
  );
}

function NotesList({ notes, canManage, freshIds, centerName, onCompose }: { notes: CenterNote[]; canManage: boolean; freshIds: Set<string>; centerName: string; onCompose: () => void }) {
  const [viewing, setViewing] = useState<CenterNote | null>(null);
  const [menuFor, setMenuFor] = useState<CenterNote | null>(null);

  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-[16px] bg-bg-1 px-6 py-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-bg-2 text-text-3">
          <FileText size={22} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <p className="text-[17px] font-semibold text-text-1">Aucune note de service</p>
        <p className="max-w-[300px] text-[14px] text-text-2">
          {canManage ? `Publiez la première : un PDF ou une image, visible par les membres de ${centerName}.` : "Les notes publiées par le chef de centre et le responsable communication apparaîtront ici."}
        </p>
        {canManage && (
          <button type="button" onClick={onCompose} className="pressable mt-2 flex h-11 items-center gap-2 rounded-full bg-bg-2 px-5 text-[15px] font-semibold text-text-1">
            <Plus size={18} strokeWidth={2.25} aria-hidden="true" />
            Publier une note
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <p className="flex items-center gap-1.5 px-1 text-[12.5px] text-text-3">
        <Lock size={12} strokeWidth={2} aria-hidden="true" />
        Réservé aux membres du centre et au service communication.
      </p>
      <ul className="space-y-3">
        {notes.map((n) => (
          <li key={n.id}>
            <NoteCard note={n} fresh={freshIds.has(n.id)} canManage={canManage} onOpen={() => setViewing(n)} onMenu={() => setMenuFor(n)} />
          </li>
        ))}
      </ul>
      <Lightbox open={viewing?.kind === "image"} src={viewing ? mediaUrl(viewing.file_key) : undefined} alt={viewing?.title ?? ""} onClose={() => setViewing(null)} caption={viewing?.title} />
      {canManage && <NoteMenu note={menuFor} onClose={() => setMenuFor(null)} />}
    </>
  );
}

function NoteCard({ note, fresh, canManage, onOpen, onMenu }: { note: CenterNote; fresh: boolean; canManage: boolean; onOpen: () => void; onMenu: () => void }) {
  const role = note.author?.role ? NOTE_ROLE_LABELS[note.author.role] : null;
  const url = mediaUrl(note.file_key);
  const content = (
    <>
      {note.kind === "image" && (
        // eslint-disable-next-line @next/next/no-img-element -- document du centre, URL directe
        <img src={url} alt={note.title} className="max-h-64 w-full bg-bg-2 object-cover" width={note.width ?? undefined} height={note.height ?? undefined} loading="lazy" />
      )}
      <div className="flex items-start gap-3 px-4 py-3">
        {note.kind === "pdf" && (
          <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-red-soft text-red-text">
            <FileText size={22} strokeWidth={1.75} aria-hidden="true" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-start gap-2">
            <span className="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-text-1">{note.title}</span>
            {fresh && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-fill" aria-label="Nouvelle" />}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-text-3">
            {note.pinned && <Pin size={13} strokeWidth={2} aria-label="Épinglée" className="text-text-2" />}
            {role && <span className="text-text-2">{role}</span>}
            {role && note.author?.name && <span aria-hidden="true">·</span>}
            {note.author?.name && <span>{note.author.name}</span>}
            <span aria-hidden="true">·</span>
            <time dateTime={note.published_at}>{formatDateLong(note.published_at)}</time>
            {note.kind === "pdf" && (
              <>
                <span aria-hidden="true">·</span>
                <span>PDF</span>
              </>
            )}
          </span>
          {note.body && <span className="mt-1.5 block whitespace-pre-line text-[14px] leading-[1.45] text-text-2">{note.body}</span>}
        </span>
      </div>
    </>
  );
  return (
    <article className={cn("relative overflow-hidden rounded-[16px] bg-bg-1", fresh && "ring-1 ring-red-fill/40")} aria-label={`Note : ${note.title}`}>
      {note.kind === "pdf" ? (
        <a href={url} target="_blank" rel="noreferrer" className="pressable block" aria-label={`Ouvrir le PDF : ${note.title}`}>
          {content}
        </a>
      ) : (
        <button type="button" onClick={onOpen} className="pressable block w-full text-left" aria-label={`Voir l'image : ${note.title}`}>
          {content}
        </button>
      )}
      {canManage && (
        <button type="button" onClick={onMenu} aria-label={`Options de la note ${note.title}`} className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-bg-0/70 text-text-2 backdrop-blur-sm hover:text-text-1">
          <MoreHorizontal size={18} strokeWidth={2} aria-hidden="true" />
        </button>
      )}
      {note.author && note.kind === "pdf" && <Avatar name={note.author.name} avatarKey={note.author.avatar_key} size="xs" className="absolute bottom-3 right-4 ring-1 ring-glass-edge" />}
    </article>
  );
}

function NoteMenu({ note, onClose }: { note: CenterNote | null; onClose: () => void }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const item = "pressable flex min-h-12 w-full items-center gap-3 px-5 text-left text-[15px] text-text-1 disabled:opacity-50";
  return (
    <Sheet open={Boolean(note)} onClose={onClose} title={note?.title ?? "Note"}>
      {note && (
        <div className="pb-[max(env(safe-area-inset-bottom),12px)]">
          <button
            type="button"
            disabled={pending}
            className={item}
            onClick={() =>
              start(async () => {
                const r = await pinNote(note.id, !note.pinned);
                toast(r.ok ? (note.pinned ? "Note désépinglée" : "Note épinglée en tête de liste") : r.error);
                onClose();
                router.refresh();
              })
            }
          >
            <Pin size={18} strokeWidth={1.75} aria-hidden="true" />
            {note.pinned ? "Désépingler" : "Épingler en tête"}
          </button>
          <button
            type="button"
            disabled={pending}
            className={cn(item, "text-red-text")}
            onClick={async () => {
              if (!(await confirm({ title: "Retirer cette note ?", message: "Elle disparaît pour tous les membres du centre.", confirmLabel: "Retirer", danger: true }))) return;
              start(async () => {
                const r = await deleteNote(note.id);
                toast(r.ok ? "Note retirée" : r.error);
                onClose();
                router.refresh();
              });
            }}
          >
            <FileText size={18} strokeWidth={1.75} aria-hidden="true" />
            Retirer la note
          </button>
        </div>
      )}
    </Sheet>
  );
}
