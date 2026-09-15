"use client";

import Link from "next/link";
import { useActionState, useMemo, useState, useTransition } from "react";
import { deletePost, savePost, type PostFormState } from "@/app/(studio)/studio/posts/actions";
import type { FeedPost } from "@/lib/feed/types";
import { toDatetimeLocal } from "@/lib/format";
import { LIMITS, FEATURES } from "@/lib/config";
import type { EditorPostType } from "@/lib/validation/post";
import { Button } from "@/components/ui/Button";
import { CheckboxField, Field, SelectField, TextareaField } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { PostCard } from "@/components/feed/PostCard";
import { VideoPanel } from "@/components/studio/VideoPanel";
import { MediaUploader, type EditorMedia } from "./MediaUploader";
import { cn } from "@/lib/cn";

type Ref = { id: string; name: string; slug: string };

const TYPES: { id: EditorPostType | "poll"; label: string; hint: string; soon?: boolean }[] = [
  { id: "photo", label: "Photos", hint: `1 à ${LIMITS.imagesPerPost} photos en carrousel, avec un texte en dessous.` },
  { id: "video", label: "Vidéo", hint: "Une vidéo MP4 (H.264), lecture automatique muette dans le fil." },
  { id: "text", label: "Annonce", hint: "Texte court sans média (2000 caractères max)." },
  { id: "article", label: "Article", hint: "Titre, chapô, texte long mis en forme et image de couverture." },
  { id: "poll", label: "Sondage", hint: "Une question, 2 à 6 réponses, résultats visibles après le vote." },
];

const initial: PostFormState = { status: "idle" };

const STATUS_BADGE: Record<string, { label: string; tone: "neutral" | "navy" | "success" | "red" }> = {
  draft: { label: "Brouillon", tone: "neutral" },
  scheduled: { label: "Programmée", tone: "navy" },
  published: { label: "Publiée", tone: "success" },
  archived: { label: "Archivée", tone: "neutral" },
};

export function PostEditor({
  post,
  categories,
  centers,
  authorName,
  notice,
  defaultType,
}: {
  post: FeedPost | null;
  /** Type présélectionné pour une nouvelle publication (menu « + ») */
  defaultType?: EditorPostType;
  categories: Ref[];
  centers: Ref[];
  authorName: string;
  notice?: string | null;
}) {
  const [state, action, pending] = useActionState(savePost, initial);
  const [deleting, startDelete] = useTransition();
  const fields = state.status === "error" ? state.fields ?? {} : {};

  const initialType: EditorPostType =
    post && (["text", "photo", "video", "article", "poll"] as string[]).includes(post.type) ? (post.type as EditorPostType) : (defaultType ?? "photo");

  const [type, setType] = useState<EditorPostType>(initialType);
  const [title, setTitle] = useState(post?.title ?? "");
  const [location, setLocation] = useState(post?.location ?? "");
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
  const [body, setBody] = useState(post?.body ?? "");
  const [categoryId, setCategoryId] = useState(post?.category?.id ?? "");
  const [centerId, setCenterId] = useState(post?.center?.id ?? "");
  const [tags, setTags] = useState(post?.tags.join(", ") ?? "");
  const [authorDisplay, setAuthorDisplay] = useState<"service_com" | "agent">(post?.author_display ?? "service_com");
  const [pinned, setPinned] = useState(Boolean(post?.pinned_at));
  const [commentsEnabled, setCommentsEnabled] = useState(post?.comments_enabled ?? true);
  const [schedule, setSchedule] = useState(post?.status === "scheduled");
  const [scheduledAt, setScheduledAt] = useState(toDatetimeLocal(post?.scheduled_at));
  const [previewFull, setPreviewFull] = useState(false);
  const [pollOptions, setPollOptions] = useState(post?.poll?.options.map((o) => o.label).join("\n") ?? "");
  const [pollCloses, setPollCloses] = useState(toDatetimeLocal(post?.poll?.closes_at));
  const pollVotes = post?.poll?.total_votes ?? 0;
  const [media, setMedia] = useState<EditorMedia[]>(() => {
    const list = post ? (post.type === "article" && post.cover ? [post.cover] : post.media) : [];
    return list.map((m) => ({ ...m, status: "ready" as const, progress: 1 }));
  });

  const readyMedia = media.filter((m) => m.status !== "error");
  const busy = media.some((m) => m.status !== "ready" && m.status !== "error");

  const preview: FeedPost = useMemo(
    () => ({
      id: post?.id ?? "preview",
      type,
      slug: post?.slug ?? "apercu",
      location: location || null,
      title: title || null,
      excerpt: excerpt || null,
      body,
      tags: tags.split(/[,\n]/).map((t) => t.trim().replace(/^#/, "").toLowerCase()).filter(Boolean),
      status: post?.status ?? "draft",
      published_at: post?.published_at ?? null,
      scheduled_at: null,
      pinned_at: pinned ? (post?.pinned_at ?? "1970-01-01T00:00:00.000Z") : null,
      comments_enabled: commentsEnabled,
      author_display: authorDisplay,
      category: categories.find((c) => c.id === categoryId) ?? null,
      center: centers.find((c) => c.id === centerId) ?? null,
      author: { name: authorDisplay === "service_com" ? "Service Communication" : authorName, avatar_key: null },
      cover: type === "article" ? readyMedia[0] ?? null : null,
      media: type === "text" ? [] : readyMedia,
      poll:
        type === "poll"
          ? {
              question: title,
              closes_at: pollCloses ? new Date(pollCloses).toISOString() : null,
              total_votes: post?.poll?.total_votes ?? 0,
              my_option_id: null,
              options: pollOptions
                .split("\n")
                .map((o) => o.trim())
                .filter(Boolean)
                .map((label, i) => ({ id: post?.poll?.options[i]?.id ?? `opt-${i}`, label, position: i, votes: post?.poll?.options[i]?.votes ?? 0 })),
            }
          : null,
      reaction_counts: post?.reaction_counts ?? {},
      comment_count: post?.comment_count ?? 0,
      my_reaction: null,
      is_bookmarked: false,
    }),
    [post, type, title, location, excerpt, body, tags, pinned, commentsEnabled, authorDisplay, categoryId, centerId, categories, centers, authorName, readyMedia, pollOptions, pollCloses],
  );

  const status = post?.status ?? "draft";
  const badge = STATUS_BADGE[status] ?? STATUS_BADGE.draft;
  const mediaPayload = JSON.stringify(media.filter((m) => m.status === "ready").map((m) => ({ id: m.id, kind: m.kind, alt: m.alt })));
  const uploaderAccept = type === "photo" ? "images" : type === "video" ? "video" : "cover";

  function changeType(next: EditorPostType) {
    setType(next);
    setMedia((prev) => {
      if (next === "text" || next === "poll") return [];
      if (next === "video") return prev.filter((m) => m.kind === "video").slice(0, 1);
      if (next === "article") return prev.filter((m) => m.kind === "image").slice(0, 1);
      return prev.filter((m) => m.kind === "image");
    });
  }

  return (
    <div className="mx-auto grid min-w-0 max-w-[1200px] grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <form action={action} className="min-w-0 space-y-6">
        {post && <input type="hidden" name="id" value={post.id} />}
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="media" value={mediaPayload} />
        {!FEATURES.categories && <input type="hidden" name="category_id" value={categoryId} />}
        {!FEATURES.centers && <input type="hidden" name="center_id" value={centerId} />}
        {!FEATURES.tags && <input type="hidden" name="tags" value={tags} />}
        {!FEATURES.authorChoice && <input type="hidden" name="author_display" value={authorDisplay} />}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="min-w-0 text-[26px] font-semibold tracking-[-0.02em] text-text-1 sm:text-[28px]">{post ? "Modifier" : "Nouvelle publication"}</h1>
            <Badge tone={badge.tone}>{badge.label}</Badge>
          </div>
          <Link href="/studio/posts" className="pressable hidden text-[15px] font-medium text-text-2 hover:text-text-1 sm:inline">
            Publications
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

        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-text-2">Type de publication</legend>
          <div className="flex flex-wrap gap-2">
            {TYPES.map((t) => {
              const active = type === t.id;
              return (
                <label
                  key={t.id}
                  className={cn(
                    "cursor-pointer rounded-full px-4 text-[13px] font-medium leading-9",
                    active ? "bg-bg-2 text-text-1" : "bg-bg-1 text-text-2 hover:text-text-1",
                    t.soon && "cursor-not-allowed opacity-40",
                  )}
                  title={t.hint}
                >
                  <input type="radio" name="type_choice" value={t.id} checked={active} disabled={t.soon} onChange={() => !t.soon && changeType(t.id as EditorPostType)} className="sr-only" />
                  {t.label}
                </label>
              );
            })}
          </div>
          <p className="mt-2 text-[13px] text-text-3">{TYPES.find((t) => t.id === type)?.hint}</p>
        </fieldset>

        {type !== "text" && type !== "poll" && (
          <section className="rounded-[16px] bg-bg-1 p-5">
            <MediaUploader items={media} onChange={setMedia} accept={uploaderAccept} />
            {type === "video" && media[0] && media[0].kind === "video" && media[0].status === "ready" && !media[0].id.startsWith("tmp-") && (
              <div className="mt-4">
                <VideoPanel mediaId={media[0].id} />
              </div>
            )}
            {fields.media && (
              <p className="mt-2 text-[13px] text-red-text" role="alert">
                {fields.media}
              </p>
            )}
          </section>
        )}

        <section className="space-y-4 rounded-[16px] bg-bg-1 p-5">
          <Field
            label={type === "article" ? "Titre" : type === "poll" ? "Question" : "Titre (facultatif)"}
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            error={fields.title}
            placeholder={type === "article" ? "Exercice feux de forêt à Hesdin" : type === "poll" ? "Quel créneau pour la séance de sport ?" : "Bienvenue aux nouvelles recrues"}
          />
          <Field label="Lieu (facultatif)" name="location" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120} placeholder="CIS Arras, Stade Bollaert, Hesdin…" error={fields.location} hint="Affiché sous l'auteur, comme sur Instagram." />
          {type === "poll" && (
            <>
              <TextareaField
                label="Réponses (une par ligne, 2 à 6)"
                name="poll_options"
                value={pollOptions}
                onChange={(e) => setPollOptions(e.target.value)}
                rows={4}
                error={fields.poll_options}
                hint={pollVotes > 0 ? `${pollVotes} vote(s) enregistré(s) : seuls les libellés peuvent encore changer.` : "Choix unique. Les résultats apparaissent après le vote."}
              />
              <Field label="Clôture (facultatif)" name="poll_closes_at" type="datetime-local" value={pollCloses} onChange={(e) => setPollCloses(e.target.value)} error={fields.poll_closes_at} className="max-w-xs" />
            </>
          )}
          {type === "article" && (
            <TextareaField
              label="Chapô"
              name="excerpt"
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              maxLength={500}
              rows={2}
              error={fields.excerpt}
              hint="Deux ou trois phrases affichées dans le fil, avant « Lire l'article »."
            />
          )}
          <TextareaField
            label={type === "article" ? "Texte de l'article (Markdown)" : type === "text" ? "Texte" : type === "poll" ? "Précisions (facultatif)" : "Légende (facultatif)"}
            name="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={type === "article" ? 16 : type === "text" ? 6 : 3}
            error={fields.body}
            hint={
              type === "article"
                ? "Mise en forme : ## Sous-titre, **gras**, *italique*, - liste, > citation, [lien](https://…)"
                : `${body.length} / 2000 caractères. Les retours à la ligne sont conservés.`
            }
          />
        </section>

        <section className="hairline rounded-[16px] bg-bg-1 [&>*]:px-5">
          {FEATURES.categories && (
            <div className="py-3">
              <SelectField label="Catégorie" name="category_id" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} error={fields.category_id}>
                <option value="">Aucune</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectField>
            </div>
          )}
          {FEATURES.centers && (
            <div className="py-3">
              <SelectField label="Centre concerné" name="center_id" value={centerId} onChange={(e) => setCenterId(e.target.value)} error={fields.center_id}>
                <option value="">Tout le SDIS</option>
                {centers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectField>
            </div>
          )}
          {FEATURES.tags && (
            <div className="py-3">
              <Field label="Tags" name="tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="jsp, arras, exercice" hint="Séparés par des virgules, 10 maximum." error={fields.tags} />
            </div>
          )}
          {FEATURES.authorChoice && (
            <div className="py-3">
              <SelectField label="Auteur affiché" name="author_display" value={authorDisplay} onChange={(e) => setAuthorDisplay(e.target.value as "service_com" | "agent")}>
                <option value="service_com">Service Communication</option>
                <option value="agent">{authorName}</option>
              </SelectField>
            </div>
          )}
          <div className="py-2">
            <CheckboxField label="Épingler en haut du fil" name="pinned" checked={pinned} onChange={(e) => setPinned(e.target.checked)} hint="Trois publications épinglées au maximum" />
          </div>
          <div className="py-2">
            <CheckboxField label="Autoriser les commentaires" name="comments_enabled" checked={commentsEnabled} onChange={(e) => setCommentsEnabled(e.target.checked)} />
          </div>
          <div className="py-2">
            <CheckboxField label="Programmer la publication" name="schedule_toggle" checked={schedule} onChange={(e) => setSchedule(e.target.checked)} hint="Elle paraîtra automatiquement à la date choisie" />
          </div>
          {schedule && (
            <div className="py-3">
              <Field
                label="Date et heure de publication"
                name="scheduled_at"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                error={fields.scheduled_at}
                className="max-w-xs"
              />
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
          {busy && <span className="text-[13px] text-text-3">Envoi des médias en cours</span>}
          {post && (
            <Button
              type="button"
              variant="danger"
              size="md"
              className="ml-auto"
              loading={deleting}
              onClick={() => {
                if (window.confirm("Supprimer cette publication ? Elle disparaîtra du fil.")) {
                  startDelete(async () => {
                    await deletePost(post.id);
                  });
                }
              }}
            >
              Supprimer
            </Button>
          )}
        </div>
        {post?.status === "published" && (
          <p className="text-[13px] text-text-3">
            En ligne :{" "}
            <Link href={`/post/${post.slug}`} className="text-navy-link underline underline-offset-2" target="_blank">
              /post/{post.slug}
            </Link>
          </p>
        )}
      </form>

      {/* Aperçu tel que vu par un agent, dans un cadre de téléphone */}
      <aside className="min-w-0 lg:sticky lg:top-8 lg:self-start">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[13px] font-medium text-text-2">Aperçu agent</p>
          {type === "article" && (
            <button type="button" onClick={() => setPreviewFull((v) => !v)} className="text-[13px] font-medium text-text-2 hover:text-text-1">
              {previewFull ? "Vue fil" : "Vue article"}
            </button>
          )}
        </div>
        <div className="mx-auto w-full max-w-[360px] overflow-hidden rounded-[36px] bg-bg-0 ring-[6px] ring-bg-2">
          <div className="mx-auto mt-2 h-[26px] w-[110px] rounded-full bg-bg-2" aria-hidden="true" />
          <div className="max-h-[70vh] overflow-y-auto px-4 pb-6 pt-3">
            <PostCard key={previewFull ? "full" : "feed"} post={preview} preview variant={previewFull ? "full" : "feed"} />
          </div>
        </div>
      </aside>
    </div>
  );
}
