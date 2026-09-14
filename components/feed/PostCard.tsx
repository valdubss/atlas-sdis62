"use client";

import Link from "next/link";
import { useCallback, useRef, useState, useTransition } from "react";
import type { FeedPost } from "@/lib/feed/types";
import { FEATURES, type ReactionKind } from "@/lib/config";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/cn";
import { reactToPost, toggleBookmark } from "@/app/(app)/feed-actions";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Sheet } from "@/components/ui/Sheet";
import { ReactionBar } from "./ReactionBar";
import { IconButton } from "./IconButton";
import { ShareButton } from "./ShareButton";
import { Comments } from "./Comments";
import { Markdown } from "./Markdown";
import { PhotoCarousel } from "./PhotoCarousel";
import { VideoPlayer } from "./VideoPlayer";

const TEXT_CLAMP = 300;

/**
 * Carte de publication. Mobile-first : bord à bord, médias plein cadre,
 * double-tap = ❤️, commentaires dans un panneau bas.
 *  - variant "feed" : aperçu (texte tronqué, article → lien)
 *  - variant "full" : page de lecture (Markdown complet, commentaires inline)
 *  - preview : aperçu studio, interactions désactivées
 */
export function PostCard({
  post: initial,
  variant = "feed",
  canModerate = false,
  preview = false,
}: {
  post: FeedPost;
  variant?: "feed" | "full";
  canModerate?: boolean;
  preview?: boolean;
}) {
  const [post, setPost] = useState(initial);
  const [expanded, setExpanded] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [heartBurst, setHeartBurst] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const lastTap = useRef(0);

  // En mode aperçu (studio), la carte suit les changements de l'éditeur.
  const shown = preview ? initial : post;

  const react = useCallback(
    (kind: ReactionKind) => {
      if (preview) return;
      setError(null);
      setPost((p) => {
        const counts = { ...p.reaction_counts };
        if (p.my_reaction) counts[p.my_reaction] = Math.max(0, (counts[p.my_reaction] ?? 1) - 1);
        const next = p.my_reaction === kind ? null : kind;
        if (next) counts[next] = (counts[next] ?? 0) + 1;
        return { ...p, reaction_counts: counts, my_reaction: next };
      });
      startTransition(async () => {
        const res = await reactToPost(post.id, kind);
        if (res.ok) setPost((p) => ({ ...p, reaction_counts: res.reaction_counts, my_reaction: res.my_reaction }));
        else {
          setPost(initial);
          setError(res.error);
        }
      });
    },
    [post.id, preview, initial],
  );

  function onDoubleTap() {
    if (preview) return;
    setHeartBurst(true);
    setTimeout(() => setHeartBurst(false), 700);
    if (post.my_reaction !== "heart") react("heart");
  }

  function handleTap() {
    const now = Date.now();
    if (now - lastTap.current < 300) onDoubleTap();
    lastTap.current = now;
  }

  function bookmark() {
    if (preview) return;
    setPost((p) => ({ ...p, is_bookmarked: !p.is_bookmarked }));
    startTransition(async () => {
      const res = await toggleBookmark(post.id);
      if (res.ok) setPost((p) => ({ ...p, is_bookmarked: res.bookmarked }));
      else setPost((p) => ({ ...p, is_bookmarked: !p.is_bookmarked }));
    });
  }

  const official = shown.author_display === "service_com";
  const body = shown.body ?? "";
  const clampable = variant === "feed" && shown.type !== "article" && body.length > TEXT_CLAMP;
  const shownBody = clampable && !expanded ? body.slice(0, TEXT_CLAMP).trimEnd() + "…" : body;
  const images = shown.media.filter((m) => m.kind === "image");
  const video = shown.media.find((m) => m.kind === "video") ?? null;
  const cover = shown.cover ?? (shown.type === "article" ? images[0] ?? null : null);
  const href = `/post/${shown.slug}`;
  const meta = [
    FEATURES.categories && shown.category ? shown.category.name : null,
    formatRelative(shown.published_at ?? shown.scheduled_at),
    FEATURES.centers && shown.center ? shown.center.name : null,
  ].filter(Boolean);

  return (
    <article
      className={cn(
        "relative bg-surface",
        variant === "feed" && "border-b border-line sm:rounded-card sm:border sm:shadow-soft",
        variant === "full" && "sm:rounded-card sm:shadow-soft",
      )}
      aria-label={shown.title ?? "Publication"}
    >
      {/* En-tête */}
      <header className="flex items-center gap-3 px-4 pt-3 pb-2">
        <Avatar name={shown.author?.name} avatarKey={shown.author?.avatar_key} official={official} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[15px] font-semibold text-ink">{shown.author?.name ?? "Service Communication"}</p>
          <p className="truncate text-xs text-muted">{meta.join(" · ")}</p>
        </div>
        {shown.pinned_at && (
          <Badge tone="red" className="shrink-0">
            Épinglé
          </Badge>
        )}
      </header>

      {/* Médias plein cadre */}
      {shown.type === "photo" && images.length > 0 && (
        <div className="relative">
          <PhotoCarousel media={images} size={variant === "full" ? "full" : "medium"} onTap={handleTap} onDoubleTap={onDoubleTap} />
          <HeartBurst show={heartBurst} />
        </div>
      )}
      {shown.type === "video" && video && (
        <div className="relative">
          <VideoPlayer media={video} controls={variant === "full"} autoplay={!preview} onDoubleTap={onDoubleTap} />
          <HeartBurst show={heartBurst} />
        </div>
      )}
      {shown.type === "article" && cover && (
        <div className="relative">
          <PhotoCarousel media={[cover]} size={variant === "full" ? "full" : "medium"} onTap={handleTap} onDoubleTap={onDoubleTap} />
          <HeartBurst show={heartBurst} />
        </div>
      )}

      {/* Corps */}
      {(shown.title || body) && (
        <div
          className="relative px-4 pt-2 pb-1"
          onClick={shown.media.length ? undefined : handleTap}
          onDoubleClick={shown.media.length ? undefined : onDoubleTap}
        >
          {!shown.media.length && <HeartBurst show={heartBurst} />}
          {shown.title && (
            <h2 className="mb-1 font-display text-[22px] font-bold uppercase leading-tight text-ink">
              {variant === "feed" && shown.type === "article" ? <Link href={href}>{shown.title}</Link> : shown.title}
            </h2>
          )}

          {shown.type === "article" ? (
            variant === "full" ? (
              <>
                {shown.excerpt && <p className="mb-3 text-[17px] font-medium leading-snug text-body">{shown.excerpt}</p>}
                <Markdown>{body}</Markdown>
              </>
            ) : (
              <>
                <p className="text-[15px] leading-relaxed text-body">
                  {shown.excerpt ?? body.replace(/[#*_>`\[\]]/g, "").slice(0, 220).trimEnd() + "…"}
                </p>
                <Link href={href} className="mt-1 inline-block text-sm font-bold text-red-text">
                  Lire l&apos;article →
                </Link>
              </>
            )
          ) : (
            body && (
              <p className="whitespace-pre-line break-words text-[15px] leading-relaxed text-body">
                {shownBody}
                {clampable && !expanded && (
                  <>
                    {" "}
                    <button type="button" onClick={() => setExpanded(true)} className="font-semibold text-muted">
                      voir plus
                    </button>
                  </>
                )}
              </p>
            )
          )}

          {FEATURES.tags && shown.tags.length > 0 && (
            <p className="mt-2 flex flex-wrap gap-x-2 text-xs font-semibold text-navy">
              {shown.tags.map((t) => (
                <Link key={t} href={`/?tag=${encodeURIComponent(t)}`}>
                  #{t}
                </Link>
              ))}
            </p>
          )}
        </div>
      )}

      {/* Pied : réactions, commentaires, favori, partage */}
      <footer className="flex items-center justify-between gap-2 px-3 pb-2 pt-1">
        <ReactionBar counts={shown.reaction_counts} mine={shown.my_reaction} onSelect={react} disabled={preview} />
        <div className="flex items-center">
          <IconButton
            label="Commentaires"
            count={shown.comment_count}
            onClick={() =>
              !preview &&
              (variant === "full"
                ? document.getElementById(`comments-${shown.id}`)?.scrollIntoView({ behavior: "smooth" })
                : setCommentsOpen(true))
            }
          >
            <path d="M21 12a8 8 0 0 1-11.6 7.2L4 21l1.8-4.6A8 8 0 1 1 21 12z" strokeLinejoin="round" />
          </IconButton>
          <IconButton label={shown.is_bookmarked ? "Retirer des favoris" : "Enregistrer"} active={shown.is_bookmarked} onClick={bookmark}>
            <path d="M6 4h12v17l-6-4-6 4V4z" strokeLinejoin="round" />
          </IconButton>
          <ShareButton slug={shown.slug} title={shown.title} />
        </div>
      </footer>
      {error && (
        <p className="px-4 pb-2 text-xs text-danger" role="alert">
          {error}
        </p>
      )}

      {variant === "full" && !preview && (
        <section id={`comments-${shown.id}`} className="border-t border-line pt-3">
          <h3 className="px-4 pb-1 font-display text-lg font-bold uppercase text-navy">Commentaires</h3>
          <Comments
            postId={shown.id}
            enabled={shown.comments_enabled}
            canModerate={canModerate}
            onCountChange={(n) => setPost((p) => ({ ...p, comment_count: n }))}
          />
        </section>
      )}

      {variant === "feed" && !preview && (
        <Sheet open={commentsOpen} onClose={() => setCommentsOpen(false)} title="Commentaires">
          <Comments
            postId={shown.id}
            enabled={shown.comments_enabled}
            canModerate={canModerate}
            autoFocus
            onCountChange={(n) => setPost((p) => ({ ...p, comment_count: n }))}
          />
        </Sheet>
      )}
    </article>
  );
}

function HeartBurst({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex items-center justify-center text-7xl drop-shadow-lg animate-[heart_.7s_ease-out]"
    >
      ❤️
    </span>
  );
}
