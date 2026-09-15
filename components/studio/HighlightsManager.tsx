"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { createHighlight, deleteHighlight, renameHighlight, reorderHighlights, setHighlightActive, setHighlightCover } from "@/app/(studio)/studio/stories/actions";
import type { MediaItem } from "@/lib/feed/types";
import { imageSrc, posterSrc } from "@/lib/media/url";
import { HIGHLIGHT_TITLE_MAX_LENGTH } from "@/lib/stories/overlay";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export type HighlightRow = {
  id: string;
  title: string;
  is_active: boolean;
  position: number;
  cover_media_id: string | null;
  items: { story_id: string; position: number; story: { id: string; media: MediaItem | null } | null }[];
};

type Run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => void;

function thumb(m: MediaItem | null | undefined) {
  return m ? (m.kind === "video" ? posterSrc(m) : imageSrc(m, "thumb")) : undefined;
}

/**
 * À la une : titre court (16), ordre du bandeau (glisser ou flèches),
 * couverture choisie parmi les stories du regroupement.
 */
export function HighlightsManager({ highlights, pending, run }: { highlights: HighlightRow[]; pending: boolean; run: Run }) {
  const [order, setOrder] = useState(highlights.map((h) => h.id));
  const [newTitle, setNewTitle] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  useEffect(() => setOrder(highlights.map((h) => h.id)), [highlights]);
  const rows = order.map((id) => highlights.find((h) => h.id === id)).filter((h): h is HighlightRow => Boolean(h));

  function commit(next: string[]) {
    setOrder(next);
    run(() => reorderHighlights(next), "Ordre enregistré");
  }
  function moveTo(id: string, index: number) {
    const from = order.indexOf(id);
    if (from < 0 || index < 0 || index >= order.length || from === index) return;
    const next = [...order];
    next.splice(from, 1);
    next.splice(index, 0, id);
    commit(next);
  }

  return (
    <section className="space-y-3">
      <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">À la une</h2>
      <p className="text-[13px] text-text-3">Regroupements permanents visibles dans le bandeau (par exemple « Feux 2026 » ou « JSP »). Titre court (16 caractères), ordre par glisser ou flèches, couverture au choix.</p>
      <div className="hairline rounded-[16px] bg-bg-1">
        {rows.map((h, i) => (
          <HighlightItem
            key={h.id}
            h={h}
            index={i}
            total={rows.length}
            pending={pending}
            run={run}
            dragging={dragId === h.id}
            onDragStart={() => setDragId(h.id)}
            onDragOver={() => {
              if (dragId && dragId !== h.id) moveTo(dragId, i);
            }}
            onDragEnd={() => setDragId(null)}
            onMove={(delta) => moveTo(h.id, i + delta)}
          />
        ))}
        <form
          className="flex gap-2 px-5 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newTitle.trim()) return;
            run(() => createHighlight(newTitle), "À-la-une créé");
            setNewTitle("");
          }}
        >
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Nouvel à-la-une (titre)"
            aria-label="Titre du nouvel à-la-une"
            maxLength={HIGHLIGHT_TITLE_MAX_LENGTH}
            className="h-10 flex-1 rounded-[10px] bg-bg-2 px-3 text-[15px] text-text-1 outline-none ring-1 ring-transparent focus:ring-glass-edge"
          />
          <span className="self-center text-[12px] tabular-nums text-text-4">
            {newTitle.length}/{HIGHLIGHT_TITLE_MAX_LENGTH}
          </span>
          <Button type="submit" variant="secondary" size="md" disabled={pending || !newTitle.trim()}>
            Créer
          </Button>
        </form>
      </div>
    </section>
  );
}

function HighlightItem({
  h,
  index,
  total,
  pending,
  run,
  dragging,
  onDragStart,
  onDragOver,
  onDragEnd,
  onMove,
}: {
  h: HighlightRow;
  index: number;
  total: number;
  pending: boolean;
  run: Run;
  dragging: boolean;
  onDragStart: () => void;
  onDragOver: () => void;
  onDragEnd: () => void;
  onMove: (delta: 1 | -1) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(h.title);
  const [pickingCover, setPickingCover] = useState(false);
  const items = [...h.items].sort((a, b) => a.position - b.position);
  const cover = items.find((it) => it.story?.media?.id === h.cover_media_id)?.story?.media ?? items[0]?.story?.media ?? null;

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver();
      }}
      onDragEnd={onDragEnd}
      className={cn("flex items-start gap-3 px-3 py-3 sm:px-5", dragging && "opacity-50")}
    >
      <span className="mt-2 cursor-grab text-text-4" aria-hidden="true">
        <GripVertical size={18} strokeWidth={1.75} />
      </span>
      <button type="button" onClick={() => setPickingCover((v) => !v)} aria-label={`Choisir la couverture de ${h.title}`} className="h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-glass-edge bg-bg-2">
        {thumb(cover) && (
          // eslint-disable-next-line @next/next/no-img-element -- vignette
          <img src={thumb(cover)} alt="" className="h-full w-full object-cover" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        {editing ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => renameHighlight(h.id, title), "Titre modifié");
              setEditing(false);
            }}
          >
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={HIGHLIGHT_TITLE_MAX_LENGTH} autoFocus aria-label="Titre" className="h-9 flex-1 rounded-[8px] bg-bg-2 px-2 text-[15px] text-text-1 outline-none" />
            <Button type="submit" variant="secondary" size="sm">
              OK
            </Button>
          </form>
        ) : (
          <>
            <p className={cn("text-[15px] text-text-1", !h.is_active && "opacity-50")}>{h.title}</p>
            <p className="text-[13px] text-text-3">
              {items.length} {items.length > 1 ? "stories" : "story"}
              {!h.is_active && ", masqué"}
            </p>
          </>
        )}
        {pickingCover && items.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Couverture">
            {items.map((it) => {
              const m = it.story?.media ?? null;
              if (!m) return null;
              const active = (h.cover_media_id ?? items[0]?.story?.media?.id) === m.id;
              return (
                <button
                  key={it.story_id}
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    run(() => setHighlightCover(h.id, m.id), "Couverture modifiée");
                    setPickingCover(false);
                  }}
                  aria-pressed={active}
                  className={cn("h-14 w-8 overflow-hidden rounded-[6px] bg-bg-2 ring-2", active ? "ring-text-1" : "ring-transparent")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- vignette */}
                  <img src={thumb(m)} alt="" className="h-full w-full object-cover" />
                </button>
              );
            })}
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap gap-4">
          <TextButton disabled={pending} onClick={() => setEditing((v) => !v)}>
            Renommer
          </TextButton>
          <TextButton disabled={pending} onClick={() => run(() => setHighlightActive(h.id, !h.is_active), h.is_active ? "À-la-une masqué" : "À-la-une visible")}>
            {h.is_active ? "Masquer" : "Afficher"}
          </TextButton>
          <TextButton
            disabled={pending}
            onClick={() => {
              if (window.confirm(`Supprimer l'à-la-une « ${h.title} » ? Les stories restent dans l'archive.`)) run(() => deleteHighlight(h.id), "À-la-une supprimé");
            }}
          >
            Supprimer
          </TextButton>
        </div>
      </div>
      <div className="flex flex-col">
        <button type="button" disabled={pending || index === 0} onClick={() => onMove(-1)} aria-label="Monter" className="flex h-8 w-8 items-center justify-center text-text-3 hover:text-text-1 disabled:opacity-30">
          <ChevronUp size={18} strokeWidth={1.75} />
        </button>
        <button type="button" disabled={pending || index === total - 1} onClick={() => onMove(1)} aria-label="Descendre" className="flex h-8 w-8 items-center justify-center text-text-3 hover:text-text-1 disabled:opacity-30">
          <ChevronDown size={18} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}

function TextButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="text-[13px] font-medium text-text-2 hover:text-text-1 disabled:opacity-40">
      {children}
    </button>
  );
}
