"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { createHighlight, deleteHighlight, deleteStory, expireStory, renameHighlight, republishStory, setHighlightActive, toggleStoryInHighlight } from "@/app/(studio)/studio/stories/actions";
import type { MediaItem, StoryOverlay } from "@/lib/feed/types";
import { imageSrc, posterSrc } from "@/lib/media/url";
import { formatDateTime } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export type StoryRow = {
  id: string;
  status: "draft" | "scheduled" | "published" | "expired" | "archived";
  overlay: StoryOverlay;
  display_seconds: number;
  scheduled_at: string | null;
  published_at: string | null;
  expires_at: string | null;
  created_at: string;
  series: { id: string; title: string } | null;
  media: MediaItem | null;
  views: { count: number }[];
  highlight_items: { highlight_id: string }[];
};

export type HighlightRow = { id: string; title: string; is_active: boolean; position: number; items: { story_id: string }[] };

function remaining(iso: string | null) {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expirée";
  const h = Math.round(ms / 3600_000);
  return h < 1 ? "moins d'une heure" : h < 48 ? `${h} h restantes` : `${Math.round(h / 24)} jours restants`;
}

function TextButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="text-[13px] font-medium text-text-2 hover:text-text-1 disabled:opacity-40">
      {children}
    </button>
  );
}

export function StoriesList({ stories, highlights, notice }: { stories: StoryRow[]; highlights: HighlightRow[]; notice: string | null }) {
  const [pending, start] = useTransition();
  const [newTitle, setNewTitle] = useState("");
  const toast = useToast();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMessage: string) {
    start(async () => {
      const res = await fn();
      toast(res.ok ? okMessage : (res.error ?? "Erreur"));
    });
  }

  const now = Date.now();
  const live = stories.filter((s) => s.status === "published" && (!s.expires_at || new Date(s.expires_at).getTime() > now));
  const scheduled = stories.filter((s) => s.status === "scheduled");
  const drafts = stories.filter((s) => s.status === "draft");
  const archive = stories.filter((s) => s.status === "expired" || s.status === "archived" || (s.status === "published" && s.expires_at && new Date(s.expires_at).getTime() <= now));

  function Row({ s }: { s: StoryRow }) {
    const thumb = s.media ? (s.media.kind === "video" ? posterSrc(s.media) : imageSrc(s.media, "thumb")) : undefined;
    const inLive = live.includes(s);
    return (
      <div className="flex items-start gap-4 px-5 py-3">
        <span className="h-[72px] w-[40px] shrink-0 overflow-hidden rounded-[8px] bg-bg-2">
          {thumb && (
            // eslint-disable-next-line @next/next/no-img-element -- vignette
            <img src={thumb} alt="" className="h-full w-full object-cover" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] text-text-1">
            {s.series?.title ?? "Sans série"}
            {s.overlay?.text && <span className="text-text-2"> — {s.overlay.text}</span>}
          </p>
          <p className="text-[13px] text-text-3">
            {s.media?.kind === "video" ? `Vidéo ${Math.round(s.media.duration_s ?? 0)} s` : `Photo, ${s.display_seconds} s`}
            {s.status === "scheduled" && s.scheduled_at && `, prévue le ${formatDateTime(s.scheduled_at)}`}
            {inLive && s.expires_at && `, ${remaining(s.expires_at)}`}
            {s.status !== "draft" && s.status !== "scheduled" && `, ${s.views?.[0]?.count ?? 0} ${(s.views?.[0]?.count ?? 0) > 1 ? "vues" : "vue"}`}
            {s.highlight_items.length > 0 && `, à la une`}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-4">
            <Link href={`/studio/stories/${s.id}`} className="text-[13px] font-medium text-text-2 hover:text-text-1">
              Modifier
            </Link>
            {inLive && <TextButton disabled={pending} onClick={() => run(() => expireStory(s.id), "Story retirée du bandeau")}>Retirer maintenant</TextButton>}
            {archive.includes(s) && <TextButton disabled={pending} onClick={() => run(() => republishStory(s.id, 48), "Story remise en ligne pour 48 h")}>Remettre en ligne 48 h</TextButton>}
            {highlights.length > 0 && (
              <select
                aria-label="À la une"
                disabled={pending}
                value=""
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) return;
                  const inside = s.highlight_items.some((h) => h.highlight_id === id);
                  run(() => toggleStoryInHighlight(s.id, id, !inside), inside ? "Retirée de l'à-la-une" : "Ajoutée à l'à-la-une");
                }}
                className="h-8 appearance-none rounded-[8px] bg-bg-2 px-2 text-[13px] text-text-2"
              >
                <option value="">À la une…</option>
                {highlights.map((h) => (
                  <option key={h.id} value={h.id}>
                    {s.highlight_items.some((x) => x.highlight_id === h.id) ? "Retirer de " : "Ajouter à "}
                    {h.title}
                  </option>
                ))}
              </select>
            )}
            <TextButton
              disabled={pending}
              onClick={() => {
                if (window.confirm("Supprimer cette story ?")) run(() => deleteStory(s.id), "Story supprimée");
              }}
            >
              Supprimer
            </TextButton>
          </div>
        </div>
      </div>
    );
  }

  function Section({ title, rows, empty }: { title: string; rows: StoryRow[]; empty: string }) {
    return (
      <section className="space-y-3">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">
          {title} <span className="text-text-3">{rows.length}</span>
        </h2>
        <div className="hairline rounded-[16px] bg-bg-1">{rows.length === 0 ? <p className="px-5 py-6 text-[15px] text-text-2">{empty}</p> : rows.map((s) => <Row key={s.id} s={s} />)}</div>
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-[960px] space-y-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text-1">Stories</h1>
        <Link href="/studio/stories/new" className="pressable flex h-11 items-center rounded-[12px] bg-red-fill px-4 text-[15px] font-semibold text-white">
          Nouvelle story
        </Link>
      </div>
      {notice && (
        <p role="status" className="text-[15px] text-text-2">
          {notice}
        </p>
      )}

      <Section title="En ligne" rows={live} empty="Aucune story en ligne. Elles disparaissent du bandeau après leur durée de vie (48 h par défaut)." />
      <Section title="Programmées" rows={scheduled} empty="Aucune story programmée." />
      <Section title="Brouillons" rows={drafts} empty="Aucun brouillon." />

      <section className="space-y-3">
        <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">À la une</h2>
        <p className="text-[13px] text-text-3">Regroupements permanents visibles dans le bandeau (par exemple « Feux de forêt 2026 » ou « JSP »). Ajoutez-y des stories depuis les listes ci-dessus ou l&apos;archive.</p>
        <div className="hairline rounded-[16px] bg-bg-1">
          {highlights.map((h) => (
            <HighlightRowItem key={h.id} h={h} pending={pending} run={run} />
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
              maxLength={80}
              className="h-10 flex-1 rounded-[10px] bg-bg-2 px-3 text-[15px] text-text-1 outline-none ring-1 ring-transparent focus:ring-glass-edge"
            />
            <Button type="submit" variant="secondary" size="md" disabled={pending || !newTitle.trim()}>
              Créer
            </Button>
          </form>
        </div>
      </section>

      <Section title="Archive" rows={archive} empty="Les stories expirées se retrouvent ici et peuvent rejoindre un à-la-une." />
    </div>
  );
}

function HighlightRowItem({ h, pending, run }: { h: HighlightRow; pending: boolean; run: (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(h.title);
  return (
    <div className="flex items-center gap-4 px-5 py-3">
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
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} autoFocus aria-label="Titre" className="h-9 flex-1 rounded-[8px] bg-bg-2 px-2 text-[15px] text-text-1 outline-none" />
            <Button type="submit" variant="secondary" size="sm">
              OK
            </Button>
          </form>
        ) : (
          <>
            <p className={cn("text-[15px] text-text-1", !h.is_active && "opacity-50")}>{h.title}</p>
            <p className="text-[13px] text-text-3">
              {h.items.length} {h.items.length > 1 ? "stories" : "story"}
              {!h.is_active && ", masqué"}
            </p>
          </>
        )}
      </div>
      <div className="flex gap-4">
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
  );
}
