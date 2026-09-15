"use client";

import Link from "next/link";
import { NewButton } from "@/components/studio/NewButton";
import { useState, useTransition } from "react";
import { deleteStory, expireStory, republishStory, toggleStoryInHighlight } from "@/app/(studio)/studio/stories/actions";
import { HighlightsManager, type HighlightRow } from "./HighlightsManager";
import type { MediaItem, StoryOverlay } from "@/lib/feed/types";
import { imageSrc, posterSrc } from "@/lib/media/url";
import { formatDateTime } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
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
  replies?: { count: number }[];
  reactions?: { count: number }[];
  poll?: { id: string; votes: { count: number }[] } | null;
  question?: { id: string; answers: { count: number }[] } | null;
  highlight_items: { highlight_id: string }[];
};

export type { HighlightRow };

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
            {(s.reactions?.[0]?.count ?? 0) > 0 && `, ${s.reactions![0].count} réaction${s.reactions![0].count > 1 ? "s" : ""}`}
            {s.poll && `, sondage (${s.poll.votes?.[0]?.count ?? 0} vote${(s.poll.votes?.[0]?.count ?? 0) > 1 ? "s" : ""})`}
            {s.question && `, question (${s.question.answers?.[0]?.count ?? 0} réponse${(s.question.answers?.[0]?.count ?? 0) > 1 ? "s" : ""})`}
            {s.highlight_items.length > 0 && `, à la une`}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-4">
            <Link href={`/studio/stories/${s.id}`} className="text-[13px] font-medium text-text-2 hover:text-text-1">
              Modifier
            </Link>
            {(s.replies?.[0]?.count ?? 0) + (s.question?.answers?.[0]?.count ?? 0) > 0 && (
              <Link href={`/studio/stories/${s.id}/reponses`} className="text-[13px] font-medium text-navy-link">
                {(s.replies?.[0]?.count ?? 0) + (s.question?.answers?.[0]?.count ?? 0)} {(s.replies?.[0]?.count ?? 0) + (s.question?.answers?.[0]?.count ?? 0) > 1 ? "réponses" : "réponse"}
              </Link>
            )}
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
        <NewButton href="/studio/stories/new" label="Nouvelle story" />
      </div>
      {notice && (
        <p role="status" className="text-[15px] text-text-2">
          {notice}
        </p>
      )}

      <Section title="En ligne" rows={live} empty="Aucune story en ligne. Elles disparaissent du bandeau après leur durée de vie (48 h par défaut)." />
      <Section title="Programmées" rows={scheduled} empty="Aucune story programmée." />
      <Section title="Brouillons" rows={drafts} empty="Aucun brouillon." />

      <HighlightsManager highlights={highlights} pending={pending} run={run} />

      <Section title="Archive" rows={archive} empty="Les stories expirées se retrouvent ici et peuvent rejoindre un à-la-une." />
    </div>
  );
}
