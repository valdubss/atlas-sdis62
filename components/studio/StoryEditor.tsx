"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { deleteStory, saveStory, type StoryFormState } from "@/app/(studio)/studio/stories/actions";
import type { StoryItem } from "@/lib/feed/types";
import { toDatetimeLocal } from "@/lib/format";
import { EXPIRY_OPTIONS } from "@/lib/validation/story";
import { Button } from "@/components/ui/Button";
import { CheckboxField, Field, SelectField, TextareaField } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { MediaUploader, type EditorMedia } from "./MediaUploader";
import { StoryMedia } from "@/components/stories/StoryMedia";
import { cn } from "@/lib/cn";

type Series = { id: string; title: string };
type PostRef = { id: string; slug: string; title: string | null };

const initial: StoryFormState = { status: "idle" };

export function StoryEditor({ story, series, posts, notice }: { story: StoryItem | null; series: Series[]; posts: PostRef[]; notice?: string | null }) {
  const [state, action, pending] = useActionState(saveStory, initial);
  const [deleting, startDelete] = useTransition();
  const fields = state.status === "error" ? state.fields ?? {} : {};

  const [seriesId, setSeriesId] = useState(story?.series_id ?? series[0]?.id ?? "");
  const [newSeries, setNewSeries] = useState("");
  const [media, setMedia] = useState<EditorMedia[]>(story?.media ? [{ ...story.media, status: "ready", progress: 1 }] : []);
  const [text, setText] = useState(story?.overlay?.text ?? "");
  const [position, setPosition] = useState<"top" | "middle" | "bottom">(story?.overlay?.position ?? "bottom");
  const [linkPostId, setLinkPostId] = useState(story?.link_post?.id ?? "");
  const [seconds, setSeconds] = useState(story?.display_seconds ?? 7);
  const [hours, setHours] = useState(() => {
    const from = story?.published_at ?? story?.scheduled_at;
    if (!story?.expires_at || !from) return 48;
    const h = Math.round((new Date(story.expires_at).getTime() - new Date(from).getTime()) / 3600_000);
    return [24, 48, 72, 168].reduce((best, opt) => (Math.abs(opt - h) < Math.abs(best - h) ? opt : best), 48);
  });
  const [schedule, setSchedule] = useState(story?.status === "scheduled");
  const [scheduledAt, setScheduledAt] = useState(toDatetimeLocal(story?.scheduled_at));

  const ready = media.find((m) => m.status === "ready") ?? null;
  // Aperçu dès l'envoi (vignette locale), même pendant le traitement
  const previewMedia = media.find((m) => m.status !== "error") ?? null;
  const busy = media.some((m) => m.status !== "ready" && m.status !== "error");
  const status = story?.status ?? "draft";
  const badge: Record<string, { label: string; tone: "neutral" | "navy" | "success" }> = {
    draft: { label: "Brouillon", tone: "neutral" },
    scheduled: { label: "Programmée", tone: "navy" },
    published: { label: "En ligne", tone: "success" },
    expired: { label: "Expirée", tone: "neutral" },
    archived: { label: "Archivée", tone: "neutral" },
  };

  return (
    <div className="mx-auto grid min-w-0 max-w-[1200px] grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <form action={action} className="min-w-0 space-y-6">
        {story && <input type="hidden" name="id" value={story.id} />}
        <input type="hidden" name="media_id" value={ready?.id ?? ""} />
        <input type="hidden" name="overlay_position" value={position} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="min-w-0 text-[26px] font-semibold tracking-[-0.02em] text-text-1 sm:text-[28px]">{story ? "Modifier la story" : "Nouvelle story"}</h1>
            <Badge tone={badge[status].tone}>{badge[status].label}</Badge>
          </div>
          <Link href="/studio/stories" className="pressable hidden text-[15px] font-medium text-text-2 hover:text-text-1 sm:inline">
            Stories
          </Link>
        </div>

        {notice && (
          <p role="status" className="text-[15px] text-text-2">
            {notice}
          </p>
        )}
        {state.status === "error" && (
          <p role="alert" className="text-[15px] text-red-text">
            {state.message}
          </p>
        )}

        <section className="rounded-[16px] bg-bg-1 p-5">
          <MediaUploader items={media} onChange={setMedia} accept="story" />
          {fields.media && (
            <p className="mt-2 text-[13px] text-red-text" role="alert">
              {fields.media}
            </p>
          )}
        </section>

        <section className="space-y-4 rounded-[16px] bg-bg-1 p-5">
          <SelectField label="Série (bulle du bandeau)" name="series_id" value={seriesId} onChange={(e) => setSeriesId(e.target.value)} hint="Une bulle par série : les agents font défiler les stories d'une même série.">
            <option value="">Nouvelle série…</option>
            {series.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </SelectField>
          {seriesId === "" && (
            <Field label="Nom de la nouvelle série" name="series_title" value={newSeries} onChange={(e) => setNewSeries(e.target.value)} maxLength={80} placeholder="Feux de forêt, JSP Calais, Cérémonie du 14 juillet…" error={fields.series_title} />
          )}
          <TextareaField label="Texte superposé (facultatif)" name="overlay_text" value={text} onChange={(e) => setText(e.target.value)} maxLength={200} rows={2} error={fields.overlay_text} />
          <fieldset>
            <legend className="mb-2 text-[13px] font-medium text-text-2">Position du texte</legend>
            <div className="flex gap-2">
              {(["top", "middle", "bottom"] as const).map((p) => (
                <button key={p} type="button" onClick={() => setPosition(p)} className={cn("h-9 rounded-full px-4 text-[13px] font-medium", position === p ? "bg-bg-2 text-text-1" : "text-text-2 hover:text-text-1")}>
                  {p === "top" ? "Haut" : p === "middle" ? "Milieu" : "Bas"}
                </button>
              ))}
            </div>
          </fieldset>
          <SelectField label="Lien vers une publication (facultatif)" name="link_post_id" value={linkPostId} onChange={(e) => setLinkPostId(e.target.value)}>
            <option value="">Aucun</option>
            {posts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title ?? p.slug}
              </option>
            ))}
          </SelectField>
        </section>

        <section className="hairline rounded-[16px] bg-bg-1 [&>*]:px-5">
          {previewMedia?.kind !== "video" && (
            <div className="py-3">
              <SelectField label="Durée d'affichage" name="display_seconds" value={String(seconds)} onChange={(e) => setSeconds(Number(e.target.value))}>
                {[3, 5, 7, 10, 15].map((n) => (
                  <option key={n} value={n}>
                    {n} secondes
                  </option>
                ))}
              </SelectField>
            </div>
          )}
          {previewMedia?.kind === "video" && <input type="hidden" name="display_seconds" value={seconds} />}
          <div className="py-3">
            <SelectField label="Durée de vie dans le bandeau" name="expires_hours" value={String(hours)} onChange={(e) => setHours(Number(e.target.value))} hint="Après ce délai, la story rejoint l'archive et peut être mise à la une.">
              {EXPIRY_OPTIONS.map((o) => (
                <option key={o.hours} value={o.hours}>
                  {o.label}
                </option>
              ))}
            </SelectField>
          </div>
          <div className="py-2">
            <CheckboxField label="Programmer la publication" name="schedule_toggle" checked={schedule} onChange={(e) => setSchedule(e.target.checked)} />
          </div>
          {schedule && (
            <div className="py-3">
              <Field label="Date et heure" name="scheduled_at" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} error={fields.scheduled_at} className="max-w-xs" />
            </div>
          )}
        </section>

        <div className="flex flex-wrap items-center gap-3">
          {schedule ? (
            <Button type="submit" name="action" value="schedule" loading={pending} disabled={busy}>
              Programmer
            </Button>
          ) : (
            <Button type="submit" name="action" value="publish" loading={pending} disabled={busy}>
              {status === "published" ? "Mettre à jour" : "Publier"}
            </Button>
          )}
          <Button type="submit" name="action" value="draft" variant="secondary" loading={pending} disabled={busy}>
            Enregistrer le brouillon
          </Button>
          {busy && <span className="text-[13px] text-text-3">Envoi du média en cours</span>}
          {story && (
            <Button
              type="button"
              variant="danger"
              size="md"
              className="ml-auto"
              loading={deleting}
              onClick={() => {
                if (window.confirm("Supprimer cette story ?")) {
                  startDelete(async () => {
                    const res = await deleteStory(story.id);
                    if (res.ok) window.location.href = "/studio/stories";
                  });
                }
              }}
            >
              Supprimer
            </Button>
          )}
        </div>
      </form>

      <aside className="min-w-0 lg:sticky lg:top-8 lg:self-start">
        <p className="mb-3 text-[13px] font-medium text-text-2">Aperçu</p>
        <div className="mx-auto aspect-[9/16] w-full max-w-[300px] overflow-hidden rounded-[28px] bg-black ring-[6px] ring-bg-2">
          <div className="relative h-full">
            <StoryMedia media={previewMedia} overlay={text ? { text, position } : null} playing={false} />
            <div className="pointer-events-none absolute inset-x-3 top-3 flex gap-1" aria-hidden="true">
              <span className="h-[2px] flex-1 rounded-full bg-white/30">
                <span className="block h-full w-1/3 rounded-full bg-white" />
              </span>
            </div>
            <p className="pointer-events-none absolute left-3 top-6 text-[13px] font-semibold text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
              {series.find((s) => s.id === seriesId)?.title ?? newSeries ?? ""}
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
