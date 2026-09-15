"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import { deleteStory, saveStory, type StoryFormState } from "@/app/(studio)/studio/stories/actions";
import type { StoryItem } from "@/lib/feed/types";
import { toDatetimeLocal } from "@/lib/format";
import { EXPIRY_OPTIONS } from "@/lib/validation/story";
import { inMaskedZone, POLL_OPTIONS_MAX, POLL_QUESTION_MAX_LENGTH, presetToY, QUESTION_PROMPT_MAX_LENGTH } from "@/lib/stories/overlay";
import { Button } from "@/components/ui/Button";
import { CheckboxField, Field, SelectField, TextareaField } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { MediaUploader, type EditorMedia } from "./MediaUploader";
import { StoryPreview } from "./StoryPreview";
import { cn } from "@/lib/cn";
import { measureImageContrast } from "@/lib/media/contrast";
import { imageSrc } from "@/lib/media/url";

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
  const [textPos, setTextPos] = useState({ x: story?.overlay?.x ?? 0.5, y: story?.overlay?.y ?? presetToY(story?.overlay?.position ?? "bottom") });
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

  // Superpositions : sondage (2–4 réponses) et question ouverte, une de chaque au plus
  const [pollOn, setPollOn] = useState(Boolean(story?.poll));
  const [pollQuestion, setPollQuestion] = useState(story?.poll?.question ?? "");
  const [pollOptions, setPollOptions] = useState<string[]>(story?.poll?.options ?? ["", ""]);
  const [pollPos, setPollPos] = useState({ x: story?.poll?.x ?? 0.5, y: story?.poll?.y ?? 0.62 });
  const [questionOn, setQuestionOn] = useState(Boolean(story?.question));
  const [prompt, setPrompt] = useState(story?.question?.prompt ?? "");
  const [questionPos, setQuestionPos] = useState({ x: story?.question?.x ?? 0.5, y: story?.question?.y ?? 0.62 });

  const ready = media.find((m) => m.status === "ready") ?? null;

  // Contraste du texte superposé (blanc) sur la zone de l'image : avertissement sous 4,5:1
  const [contrast, setContrast] = useState<number | null>(null);
  useEffect(() => {
    if (!text.trim() || !ready || ready.kind !== "image") {
      setContrast(null);
      return;
    }
    let alive = true;
    const zone: "top" | "middle" | "bottom" = textPos.y < 0.38 ? "top" : textPos.y < 0.62 ? "middle" : "bottom";
    measureImageContrast(ready.preview_url ?? imageSrc(ready, "small"), zone).then((c) => alive && setContrast(c));
    return () => {
      alive = false;
    };
  }, [text, ready, textPos.y]);
  const lowContrast = contrast !== null && contrast < 4.5;
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
  const masked = [text && inMaskedZone(textPos.y), pollOn && inMaskedZone(pollPos.y), questionOn && inMaskedZone(questionPos.y)].some(Boolean);

  function choosePreset(p: "top" | "middle" | "bottom") {
    setPosition(p);
    setTextPos({ x: 0.5, y: presetToY(p) });
  }

  return (
    <div className="mx-auto grid min-w-0 max-w-[1200px] grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <form action={action} className="min-w-0 space-y-6">
        {story && <input type="hidden" name="id" value={story.id} />}
        <input type="hidden" name="media_id" value={ready?.id ?? ""} />
        <input type="hidden" name="overlay_position" value={position} />
        <input type="hidden" name="overlay_x" value={text ? String(textPos.x) : ""} />
        <input type="hidden" name="overlay_y" value={text ? String(textPos.y) : ""} />
        <input type="hidden" name="poll_question" value={pollOn ? pollQuestion : ""} />
        <input type="hidden" name="poll_options" value={pollOn ? pollOptions.join("\n") : ""} />
        <input type="hidden" name="poll_x" value={pollOn ? String(pollPos.x) : ""} />
        <input type="hidden" name="poll_y" value={pollOn ? String(pollPos.y) : ""} />
        <input type="hidden" name="question_prompt" value={questionOn ? prompt : ""} />
        <input type="hidden" name="question_x" value={questionOn ? String(questionPos.x) : ""} />
        <input type="hidden" name="question_y" value={questionOn ? String(questionPos.y) : ""} />

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
          <TextareaField label="Texte superposé (facultatif)" name="overlay_text" value={text} onChange={(e) => setText(e.target.value)} maxLength={200} rows={2} error={fields.overlay_text} hint="Déplacez le texte au doigt dans l'aperçu ; les zones hachurées sont recouvertes par l'interface." />
          {lowContrast && (
            <p role="status" className="rounded-[10px] bg-bg-2 px-3 py-2 text-[13px] text-text-1">
              Contraste faible ({contrast!.toFixed(1)}:1) entre le texte et l&apos;image à cet endroit : le texte risque d&apos;être peu lisible. Changez la position ou raccourcissez le texte.
            </p>
          )}
          <fieldset>
            <legend className="mb-2 text-[13px] font-medium text-text-2">Position du texte</legend>
            <div className="flex gap-2">
              {(["top", "middle", "bottom"] as const).map((p) => (
                <button key={p} type="button" onClick={() => choosePreset(p)} className={cn("h-9 rounded-full px-4 text-[13px] font-medium", position === p && textPos.y === presetToY(p) ? "bg-bg-2 text-text-1" : "text-text-2 hover:text-text-1")}>
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

        <section className="space-y-4 rounded-[16px] bg-bg-1 p-5">
          <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">Interactions</h2>
          <p className="text-[13px] text-text-3">Un sondage ou une question ouverte, placés au doigt dans l&apos;aperçu. Les votes sont anonymes à l&apos;écran ; les réponses aux questions sont visibles du service communication seulement.</p>
          <CheckboxField label="Ajouter un sondage" name="poll_toggle" checked={pollOn} onChange={(e) => setPollOn(e.target.checked)} />
          {pollOn && (
            <div className="space-y-3 rounded-[12px] bg-bg-2/60 p-4">
              <Field label="Question du sondage" name="poll_question_input" value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} maxLength={POLL_QUESTION_MAX_LENGTH} placeholder="Prêts pour la manœuvre de samedi ?" error={fields.poll} />
              <div className="space-y-2">
                {pollOptions.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={o}
                      onChange={(e) => setPollOptions((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                      maxLength={30}
                      placeholder={`Réponse ${i + 1}`}
                      aria-label={`Réponse ${i + 1}`}
                      className="h-10 min-w-0 flex-1 rounded-[10px] bg-bg-1 px-3 text-[15px] text-text-1 outline-none ring-1 ring-transparent focus:ring-glass-edge"
                    />
                    {pollOptions.length > 2 && (
                      <button type="button" onClick={() => setPollOptions((prev) => prev.filter((_, j) => j !== i))} className="text-[13px] text-text-3 hover:text-text-1" aria-label={`Retirer la réponse ${i + 1}`}>
                        Retirer
                      </button>
                    )}
                  </div>
                ))}
                {pollOptions.length < POLL_OPTIONS_MAX && (
                  <button type="button" onClick={() => setPollOptions((prev) => [...prev, ""])} className="text-[13px] font-medium text-text-2 hover:text-text-1">
                    + Ajouter une réponse
                  </button>
                )}
              </div>
            </div>
          )}
          <CheckboxField label="Ajouter une question ouverte" name="question_toggle" checked={questionOn} onChange={(e) => setQuestionOn(e.target.checked)} />
          {questionOn && (
            <div className="rounded-[12px] bg-bg-2/60 p-4">
              <Field label="Question" name="question_prompt_input" value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={QUESTION_PROMPT_MAX_LENGTH} placeholder="Une idée pour la prochaine journée portes ouvertes ?" error={fields.question} />
            </div>
          )}
          {masked && (
            <p role="status" className="rounded-[10px] bg-bg-2 px-3 py-2 text-[13px] text-text-1">
              Un élément est placé dans une zone recouverte par l&apos;interface (hachures) : il sera ramené dans la zone visible à l&apos;enregistrement.
            </p>
          )}
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
        <p className="mb-3 text-[13px] font-medium text-text-2">Aperçu 9:16</p>
        <StoryPreview
          media={previewMedia}
          title={series.find((s) => s.id === seriesId)?.title ?? newSeries ?? ""}
          text={text}
          textPos={textPos}
          poll={pollOn ? { question: pollQuestion, options: pollOptions.filter((o) => o.trim()), ...pollPos } : null}
          question={questionOn ? { prompt, ...questionPos } : null}
          onMove={(what, pos) => {
            if (what === "text") setTextPos(pos);
            else if (what === "poll") setPollPos(pos);
            else setQuestionPos(pos);
          }}
        />
        <p className="mt-2 text-center text-[12px] text-text-4">Zones hachurées : recouvertes par les barres et les réactions.</p>
      </aside>
    </div>
  );
}
