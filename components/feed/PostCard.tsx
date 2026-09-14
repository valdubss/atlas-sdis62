"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { Bookmark, MessageCircle } from "lucide-react";
import type { FeedPost } from "@/lib/feed/types";
import { FEATURES, type ReactionKind } from "@/lib/config";
import { formatRelative } from "@/lib/format";
import { haptic } from "@/lib/motion";
import { cn } from "@/lib/cn";
import { reactToPost, toggleBookmark } from "@/app/(app)/feed-actions";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Sheet } from "@/components/ui/Sheet";
import { markDirty } from "@/components/layout/RefreshWhenDirty";
import { useToast } from "@/components/ui/Toast";
import { ReactionBar } from "./ReactionBar";
import { IconButton } from "./IconButton";
import { ShareButton } from "./ShareButton";
import { Comments } from "./Comments";
import { Markdown } from "./Markdown";
import { PhotoCarousel } from "./PhotoCarousel";
import { VideoPlayer } from "./VideoPlayer";
import { PollCard } from "./PollCard";

/**
 * Carte de post : média 28 px en haut, puis zone opaque --bg-1 (16 px) avec
 * auteur 15/500, date 13 --text-3, texte 15/400 sur 4 lignes + « plus », ligne de
 * réactions minimale. Aucun bord, aucune ombre.
 *  - variant "feed" : aperçu ; "full" : page de lecture (Markdown, commentaires)
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
  const [expanded, setExpanded] = useState(variant === "full");
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const setCommentCount = useCallback((n: number) => setPost((p) => (p.comment_count === n ? p : { ...p, comment_count: n })), []);
  const toast = useToast();

  const shown = preview ? initial : post;

  const react = useCallback(
    (kind: ReactionKind) => {
      if (preview) return;
      haptic();
      setPost((p) => {
        const counts = { ...p.reaction_counts };
        if (p.my_reaction)
          counts[p.my_reaction] = Math.max(0, (counts[p.my_reaction] ?? 1) - 1);
        const next = p.my_reaction === kind ? null : kind;
        if (next) counts[next] = (counts[next] ?? 0) + 1;
        return { ...p, reaction_counts: counts, my_reaction: next };
      });
      startTransition(async () => {
        const res = await reactToPost(post.id, kind);
        if (res.ok)
          setPost((p) => ({
            ...p,
            reaction_counts: res.reaction_counts,
            my_reaction: res.my_reaction,
          }));
        else {
          setPost(initial);
          toast(res.error);
        }
      });
    },
    [post.id, preview, initial, toast],
  );

  function onDoubleTap() {
    if (!preview && post.my_reaction !== "heart") react("heart");
  }

  function bookmark() {
    if (preview) return;
    const next = !post.is_bookmarked;
    setPost((p) => ({ ...p, is_bookmarked: next }));
    startTransition(async () => {
      const res = await toggleBookmark(post.id);
      if (res.ok) {
        setPost((p) => ({ ...p, is_bookmarked: res.bookmarked }));
        markDirty("favoris");
        toast(res.bookmarked ? "Ajouté aux favoris" : "Retiré des favoris");
      } else {
        setPost((p) => ({ ...p, is_bookmarked: !next }));
        toast(res.error);
      }
    });
  }

  const official = shown.author_display === "service_com";
  const body = shown.body ?? "";
  const images = shown.media.filter((m) => m.kind === "image");
  const video = shown.media.find((m) => m.kind === "video") ?? null;
  const cover =
    shown.cover ?? (shown.type === "article" ? (images[0] ?? null) : null);
  const href = `/post/${shown.slug}`;
  const hasMedia =
    (shown.type === "photo" && images.length > 0) ||
    (shown.type === "video" && !!video) ||
    (shown.type === "article" && !!cover);
  const clampable = variant === "feed" && (body.length > 120 || /\n/.test(body));

  return (
    <article className="space-y-2" aria-label={shown.title ?? "Publication"}>
      <div className="overflow-hidden rounded-[22px] bg-bg-1">
        {shown.type === "photo" && images.length > 0 && (
          <PhotoCarousel
            media={images}
            size={variant === "full" ? "full" : "medium"}
            onDoubleTap={onDoubleTap}
            onTap={variant === "feed" ? () => router.push(href) : undefined}
            interactive={!preview}
            rounded={false}
          />
        )}
        {shown.type === "video" && video && (
          <VideoPlayer
            media={video}
            controls={variant === "full"}
            autoplay={!preview}
            onDoubleTap={onDoubleTap}
            rounded={false}
          />
        )}
        {shown.type === "article" && cover && (
          <PhotoCarousel
            media={[cover]}
            size={variant === "full" ? "full" : "medium"}
            onDoubleTap={onDoubleTap}
            onTap={variant === "feed" ? () => router.push(href) : undefined}
            interactive={!preview}
            rounded={false}
          />
        )}

        <div className={cn(variant === "feed" ? (hasMedia ? "px-3.5 pb-0.5 pt-2.5" : "px-3.5 pb-0.5 pt-3.5") : hasMedia ? "px-4 pb-1 pt-3" : "px-4 pb-1 pt-4")}>
          {/* Fil : auteur et date sur une seule ligne, l'image garde la place */}
          <header className="flex items-center gap-2.5">
            <Avatar
              name={shown.author?.name}
              avatarKey={shown.author?.avatar_key}
              official={official}
              size={variant === "feed" ? "sm" : "md"}
            />
            <div className={cn("min-w-0 flex-1 leading-tight", variant === "feed" && "flex items-baseline gap-1.5")}>
              <p className="truncate text-[14px] font-medium text-text-1">
                {shown.author?.name ?? "Service Communication"}
              </p>
              <p className="shrink-0 text-[13px] text-text-3">
                <time dateTime={shown.published_at ?? undefined}>
                  {formatRelative(shown.published_at ?? shown.scheduled_at) ||
                    (preview ? "à l'instant" : "")}
                </time>
                {FEATURES.categories && shown.category && (
                  <span> — {shown.category.name}</span>
                )}
              </p>
            </div>
            {shown.pinned_at && <Badge tone="red">Épinglé</Badge>}
          </header>

          {(shown.title || body) && (
            <div className={variant === "feed" ? "mt-1.5" : "mt-3"}>
              {shown.title && (
                <h2 className={cn("mb-0.5 font-semibold tracking-[-0.02em] leading-[1.2] text-text-1", variant === "feed" ? "text-[17px]" : "text-[22px]")}>
                  {variant === "feed" && shown.type === "article" ? (
                    <Link href={href}>{shown.title}</Link>
                  ) : (
                    shown.title
                  )}
                </h2>
              )}

              {shown.type === "article" ? (
                variant === "full" ? (
                  <>
                    {shown.excerpt && (
                      <p className="mb-3 text-[17px] text-text-2">
                        {shown.excerpt}
                      </p>
                    )}
                    <Markdown>{body}</Markdown>
                  </>
                ) : (
                  <>
                    <p className="clamp-4 text-[15px] text-text-1">
                      {shown.excerpt ??
                        body.replace(/[#*_>`\[\]]/g, "").slice(0, 320)}
                    </p>
                    <Link
                      href={href}
                      className="pressable mt-1 inline-block text-[15px] font-medium text-text-2 hover:text-text-1"
                    >
                      Lire l&apos;article
                    </Link>
                  </>
                )
              ) : (
                body && (
                  <p
                    className={cn(
                      "whitespace-pre-line break-words text-[15px] text-text-1",
                      clampable && !expanded && (hasMedia ? "clamp-2" : "clamp-4"),
                    )}
                  >
                    {body}
                  </p>
                )
              )}
              {shown.type === "poll" && shown.poll && <PollCard postId={shown.id} poll={shown.poll} preview={preview} />}
              {clampable && shown.type !== "article" && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-0.5 text-[15px] font-medium text-text-2 hover:text-text-1"
                >
                  {expanded ? "moins" : "plus"}
                </button>
              )}
            </div>
          )}

          <footer className={cn("flex items-center justify-between", variant === "feed" ? "-mx-1 mt-0" : "mt-1")}>
            <ReactionBar
              counts={shown.reaction_counts}
              mine={shown.my_reaction}
              onSelect={react}
              disabled={preview}
            />
            <div className="flex items-center">
              <IconButton
                label="Commentaires"
                icon={MessageCircle}
                count={shown.comment_count}
                onClick={() =>
                  !preview &&
                  (variant === "full"
                    ? document
                        .getElementById(`comments-${shown.id}`)
                        ?.scrollIntoView({ behavior: "smooth" })
                    : setCommentsOpen(true))
                }
              />
              <IconButton
                label={
                  shown.is_bookmarked ? "Retirer des favoris" : "Enregistrer"
                }
                icon={Bookmark}
                active={shown.is_bookmarked}
                onClick={bookmark}
              />
              <ShareButton slug={shown.slug} title={shown.title} />
            </div>
          </footer>
        </div>
      </div>

      {variant === "full" && !preview && (
        <section
          id={`comments-${shown.id}`}
          className="rounded-[16px] bg-bg-1 pt-4"
        >
          <h3 className="px-4 pb-1 text-[17px] font-semibold tracking-[-0.02em] text-text-1">
            Commentaires
          </h3>
          <Comments
            postId={shown.id}
            enabled={shown.comments_enabled}
            canModerate={canModerate}
            onCountChange={setCommentCount}
          />
        </section>
      )}

      {variant === "feed" && !preview && (
        <Sheet
          open={commentsOpen}
          onClose={() => setCommentsOpen(false)}
          title="Commentaires"
          tall
          scroll={false}
        >
          <Comments
            postId={shown.id}
            enabled={shown.comments_enabled}
            canModerate={canModerate}
            layout="sheet"
            onCountChange={setCommentCount}
          />
        </Sheet>
      )}
    </article>
  );
}
