"use client";

import Link from "next/link";
import { useActionState, useMemo, useState, useTransition } from "react";
import { deletePost, savePost, type PostFormState } from "@/app/(studio)/studio/posts/actions";
import type { FeedPost } from "@/lib/feed/types";
import { toDatetimeLocal } from "@/lib/format";
import { EDITOR_POST_TYPES } from "@/lib/validation/post";
import { Button } from "@/components/ui/Button";
import { CheckboxField, Field, SelectField, TextareaField } from "@/components/ui/Field";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PostCard } from "@/components/feed/PostCard";
import { cn } from "@/lib/cn";

type Ref = { id: string; name: string; slug: string };

const TYPE_LABELS: Record<string, { label: string; hint: string; soon?: boolean }> = {
  text: { label: "Annonce", hint: "Texte court, façon post Instagram/LinkedIn (2000 caractères max)." },
  article: { label: "Article", hint: "Titre, chapô et texte long mis en forme (Markdown)." },
  photo: { label: "Photos", hint: "1 à 20 images en carrousel.", soon: true },
  video: { label: "Vidéo", hint: "MP4 H.264 avec poster.", soon: true },
  poll: { label: "Sondage", hint: "Question à choix unique.", soon: true },
};

const initial: PostFormState = { status: "idle" };

export function PostEditor({
  post,
  categories,
  centers,
  authorName,
  notice,
}: {
  post: FeedPost | null;
  categories: Ref[];
  centers: Ref[];
  authorName: string;
  notice?: string | null;
}) {
  const [state, action, pending] = useActionState(savePost, initial);
  const [deleting, startDelete] = useTransition();
  const fields = state.status === "error" ? state.fields ?? {} : {};

  // État local pour l'aperçu en temps réel
  const [type, setType] = useState<(typeof EDITOR_POST_TYPES)[number]>(
    post && (EDITOR_POST_TYPES as readonly string[]).includes(post.type) ? (post.type as "text" | "article") : "text",
  );
  const [title, setTitle] = useState(post?.title ?? "");
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

  const preview: FeedPost = useMemo(
    () => ({
      id: post?.id ?? "preview",
      type,
      slug: post?.slug ?? "apercu",
      title: title || null,
      excerpt: excerpt || null,
      body,
      tags: tags.split(/[,\n]/).map((t) => t.trim().replace(/^#/, "").toLowerCase()).filter(Boolean),
      status: post?.status ?? "draft",
      published_at: post?.published_at ?? new Date().toISOString(),
      scheduled_at: null,
      pinned_at: pinned ? new Date().toISOString() : null,
      comments_enabled: commentsEnabled,
      author_display: authorDisplay,
      category: categories.find((c) => c.id === categoryId) ?? null,
      center: centers.find((c) => c.id === centerId) ?? null,
      author: { name: authorDisplay === "service_com" ? "Service Communication" : authorName, avatar_key: null },
      cover: post?.cover ?? null,
      media: post?.media ?? [],
      poll: null,
      reaction_counts: post?.reaction_counts ?? {},
      comment_count: post?.comment_count ?? 0,
      my_reaction: null,
      is_bookmarked: false,
    }),
    [post, type, title, excerpt, body, tags, pinned, commentsEnabled, authorDisplay, categoryId, centerId, categories, centers, authorName],
  );

  const status = post?.status ?? "draft";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      <form action={action} className="space-y-5">
        {post && <input type="hidden" name="id" value={post.id} />}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl font-bold uppercase text-navy">
              {post ? "Modifier" : "Nouvelle publication"}
            </h1>
            <StatusBadge status={status} />
          </div>
          <Link href="/studio/posts" className="text-sm font-semibold text-navy hover:underline">
            ← Publications
          </Link>
        </div>

        {notice && (
          <p role="status" className="rounded-xl bg-success/10 px-4 py-3 text-sm font-semibold text-success">
            {notice}
          </p>
        )}
        {state.status === "error" && (
          <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
            {state.message}
          </p>
        )}

        {/* Type */}
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-navy">Type de publication</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {Object.entries(TYPE_LABELS).map(([id, t]) => {
              const active = type === id;
              return (
                <label
                  key={id}
                  className={cn(
                    "cursor-pointer rounded-xl border px-3 py-2 text-sm",
                    active ? "border-navy bg-navy/5 text-navy" : "border-line text-body hover:border-navy/40",
                    t.soon && "cursor-not-allowed opacity-50",
                  )}
                  title={t.hint}
                >
                  <input
                    type="radio"
                    name="type"
                    value={id}
                    checked={active}
                    disabled={t.soon}
                    onChange={() => setType(id as "text" | "article")}
                    className="sr-only"
                  />
                  <span className="block font-semibold">{t.label}</span>
                  {t.soon && <span className="block text-[10px] uppercase tracking-wide text-muted">bientôt</span>}
                </label>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-muted">{TYPE_LABELS[type].hint}</p>
        </fieldset>

        <Card className="space-y-4 p-5">
          <Field
            label={type === "article" ? "Titre" : "Titre (facultatif)"}
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            error={fields.title}
            placeholder={type === "article" ? "Exercice feux de forêt à Hesdin" : "Ex. : Bienvenue aux nouvelles recrues"}
          />
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
            label={type === "article" ? "Texte de l'article (Markdown)" : "Texte"}
            name="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={type === "article" ? 16 : 6}
            error={fields.body}
            hint={
              type === "article"
                ? "Mise en forme : ## Sous-titre, **gras**, *italique*, - liste, > citation, [lien](https://…)"
                : `${body.length} / 2000 caractères. Les retours à la ligne sont conservés.`
            }
            className="font-[inherit]"
          />
        </Card>

        <Card className="grid gap-4 p-5 sm:grid-cols-2">
          <SelectField label="Catégorie" name="category_id" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} error={fields.category_id}>
            <option value="">— Aucune —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Centre concerné (facultatif)" name="center_id" value={centerId} onChange={(e) => setCenterId(e.target.value)} error={fields.center_id}>
            <option value="">— Tout le SDIS —</option>
            {centers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
          <Field
            label="Tags"
            name="tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="jsp, arras, exercice"
            hint="Séparés par des virgules, 10 maximum."
            error={fields.tags}
          />
          <SelectField label="Auteur affiché" name="author_display" value={authorDisplay} onChange={(e) => setAuthorDisplay(e.target.value as "service_com" | "agent")}>
            <option value="service_com">Service Communication</option>
            <option value="agent">{authorName}</option>
          </SelectField>
          <CheckboxField label="Épingler en haut du fil" name="pinned" checked={pinned} onChange={(e) => setPinned(e.target.checked)} hint="3 publications épinglées maximum." />
          <CheckboxField label="Autoriser les commentaires" name="comments_enabled" checked={commentsEnabled} onChange={(e) => setCommentsEnabled(e.target.checked)} />
        </Card>

        <Card className="space-y-4 p-5">
          <CheckboxField label="Programmer la publication" name="schedule_toggle" checked={schedule} onChange={(e) => setSchedule(e.target.checked)} hint="La publication paraîtra automatiquement à la date choisie." />
          {schedule && (
            <Field
              label="Date et heure de publication"
              name="scheduled_at"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              error={fields.scheduled_at}
              className="max-w-xs"
            />
          )}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button type="submit" name="action" value="draft" variant="ghost" loading={pending}>
              Enregistrer le brouillon
            </Button>
            {schedule ? (
              <Button type="submit" name="action" value="schedule" variant="secondary" loading={pending}>
                Programmer
              </Button>
            ) : (
              <Button type="submit" name="action" value="publish" loading={pending}>
                {status === "published" ? "Mettre à jour" : "Publier maintenant"}
              </Button>
            )}
            {post && (
              <Button
                type="button"
                variant="danger"
                size="sm"
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
            <p className="text-xs text-muted">
              Publication en ligne :{" "}
              <Link href={`/post/${post.slug}`} className="font-semibold text-navy underline" target="_blank">
                /post/{post.slug}
              </Link>
            </p>
          )}
        </Card>
      </form>

      {/* Aperçu tel que vu par un agent */}
      <aside className="lg:sticky lg:top-8 lg:self-start">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted">Aperçu agent</p>
          {type === "article" && (
            <button type="button" onClick={() => setPreviewFull((v) => !v)} className="text-xs font-semibold text-navy underline">
              {previewFull ? "Vue fil" : "Vue article"}
            </button>
          )}
        </div>
        <div className="mx-auto w-full max-w-[400px] overflow-hidden rounded-[28px] border-[6px] border-navy/80 bg-bg shadow-soft">
          <div className="h-6 bg-navy/80" aria-hidden="true" />
          <div className="max-h-[70vh] overflow-y-auto">
            <PostCard key={previewFull ? "full" : "feed"} post={preview} preview variant={previewFull ? "full" : "feed"} />
          </div>
        </div>
      </aside>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: "muted" | "navy" | "success" | "red" }> = {
    draft: { label: "Brouillon", tone: "muted" },
    scheduled: { label: "Programmé", tone: "navy" },
    published: { label: "Publié", tone: "success" },
    archived: { label: "Archivé", tone: "muted" },
  };
  const s = map[status] ?? map.draft;
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
