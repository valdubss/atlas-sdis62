"use client";

import Link from "next/link";
import { useCallback, useRef, useState, useTransition } from "react";
import type { FeedPost } from "@/lib/feed/types";
import type { ReactionKind } from "@/lib/config";
import { formatRelative } from "@/lib/format";
import { imageSrc } from "@/lib/media/url";
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

  const react = useCallback(
    (kind: ReactionKind) => {
      if (preview) return;
      setError(null);
      // Optimiste : on applique localement, on corrige avec la réponse serveur.
      setPost((p) => {
        const counts = { ...p.reaction_counts };
        if (p.my_reaction) counts[p.my_reaction] = Math.max(0, (counts[p.my_reaction] ?? 1) - 1);
        const next = p.my_reaction === kind ? null : kind;
        if (next) counts[next] = (counts[next] ?? 0) + 1;
        return { ...p, reaction_counts: counts, my_reaction: next };
      });
      startTransition(async () => {
        const res = await reactToPost(post.id, kind);
        if (res.ok) {
          setPost((p) => ({ ...p, reaction_counts: res.reaction_counts, my_reaction: res.my_reaction }));
        } else {
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

  const official = post.author_display === "service_com";
  const body = post.body ?? "";
  const isLong = variant === "feed" && post.type === "text" && body.length > TEXT_CLAMP;
  const shownBody = isLong && !expanded ? body.slice(0, TEXT_CLAMP).trimEnd() + "…" : body;
  const cover = post.cover ?? post.media[0] ?? null;
  const href = `/post/${post.slug}`;

  return (
    <article
      className={cn(
        "relative bg-surface",
        variant === "feed" && "border-b border-line sm:rounded-card sm:border sm:shadow-soft",
        variant === "full" && "sm:rounded-card sm:shadow-soft",
      )}
      aria-label={post.title ?? "Publication"}
    >
      {/* En-tête */}
      <header className="flex items-center gap-3 px-4 pt-3 pb-2">
        <Avatar name={post.author?.name} avatarKey={post.author?.avatar_key} official={official} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[15px] font-semibold text-ink">{post.author?.name ?? "Service Communication"}</p>
          <p className="truncate text-xs text-muted">
            {post.category && <span className="font-semibold text-navy">{post.category.name}</span>}
            {post.category && " · "}
            <time dateTime={post.published_at ?? undefined}>{formatRelative(post.published_at ?? post.scheduled_at)}</time>
            {post.center && <span> · {post.center.name}</span>}
          </p>
        </div>
        {post.pinned_at && (
          <Badge tone="red" className="shrink-0">
            Épinglé
          </Badge>
        )}
      </header>

      {/* Média de couverture (photos plein cadre au lot c) */}
      {cover && cover.kind === "image" && (
        <div className="relative select-none bg-surface-2" onClick={handleTap} onDoubleClick={onDoubleTap}>
          {/* eslint-disable-next-line @next/next/no-img-element -- variantes servies par le CDN S3 */}
          <img
            src={imageSrc(cover, variant === "full" ? "full" : "medium")}
            alt={cover.alt}
            width={cover.width ?? undefined}
            height={cover.height ?? undefined}
            loading="lazy"
            className="max-h-[80vh] w-full object-cover"
            style={{ aspectRatio: cover.width && cover.height ? `${cover.width}/${cover.height}` : "4/3" }}
          />
          <HeartBurst show={heartBurst} />
        </div>
      )}

      {/* Corps */}
      <div className="relative px-4 pt-2 pb-1" onClick={cover ? undefined : handleTap} onDoubleClick={cover ? undefined : onDoubleTap}>
        {!cover && <HeartBurst show={heartBurst} />}
        {post.title && (
          <h2 className="mb-1 font-display text-[22px] font-bold uppercase leading-tight text-ink">
            {variant === "feed" && post.type === "article" ? <Link href={href}>{post.title}</Link> : post.title}
          </h2>
        )}

        {post.type === "article" ? (
          variant === "full" ? (
            <>
              {post.excerpt && <p className="mb-3 text-[17px] font-medium leading-snug text-body">{post.excerpt}</p>}
              <Markdown>{body}</Markdown>
            </>
          ) : (
            <>
              <p className="text-[15px] leading-relaxed text-body">
                {post.excerpt ?? body.replace(/[#*_>`\[\]]/g, "").slice(0, 220).trimEnd() + "…"}
              </p>
              <Link href={href} className="mt-1 inline-block text-sm font-bold text-red-text">
                Lire l&apos;article →
              </Link>
            </>
          )
        ) : (
          <p className="whitespace-pre-line break-words text-[15px] leading-relaxed text-body">
            {shownBody}
            {isLong && !expanded && (
              <>
                {" "}
                <button type="button" onClick={() => setExpanded(true)} className="font-semibold text-muted">
                  voir plus
                </button>
              </>
            )}
          </p>
        )}

        {post.tags.length > 0 && (
          <p className="mt-2 flex flex-wrap gap-x-2 text-xs font-semibold text-navy">
            {post.tags.map((t) => (
              <Link key={t} href={`/?tag=${encodeURIComponent(t)}`}>
                #{t}
              </Link>
            ))}
          </p>
        )}
      </div>

      {/* Pied : réactions, commentaires, favori, partage */}
      <footer className="flex items-center justify-between gap-2 px-3 pb-2 pt-1">
        <ReactionBar counts={post.reaction_counts} mine={post.my_reaction} onSelect={react} disabled={preview} />
        <div className="flex items-center">
          <IconButton
            label="Commentaires"
            count={post.comment_count}
            onClick={() => !preview && (variant === "full" ? document.getElementById(`comments-${post.id}`)?.scrollIntoView({ behavior: "smooth" }) : setCommentsOpen(true))}
          >
            <path d="M21 12a8 8 0 0 1-11.6 7.2L4 21l1.8-4.6A8 8 0 1 1 21 12z" strokeLinejoin="round" />
          </IconButton>
          <IconButton label={post.is_bookmarked ? "Retirer des favoris" : "Enregistrer"} active={post.is_bookmarked} onClick={bookmark}>
            <path d="M6 4h12v17l-6-4-6 4V4z" strokeLinejoin="round" />
          </IconButton>
          <ShareButton slug={post.slug} title={post.title} />
        </div>
      </footer>
      {error && (
        <p className="px-4 pb-2 text-xs text-danger" role="alert">
          {error}
        </p>
      )}

      {variant === "full" && !preview && (
        <section id={`comments-${post.id}`} className="border-t border-line pt-3">
          <h3 className="px-4 pb-1 font-display text-lg font-bold uppercase text-navy">Commentaires</h3>
          <Comments
            postId={post.id}
            enabled={post.comments_enabled}
            canModerate={canModerate}
            onCountChange={(n) => setPost((p) => ({ ...p, comment_count: n }))}
          />
        </section>
      )}

      {variant === "feed" && (
        <Sheet open={commentsOpen} onClose={() => setCommentsOpen(false)} title="Commentaires">
          <Comments
            postId={post.id}
            enabled={post.comments_enabled}
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
