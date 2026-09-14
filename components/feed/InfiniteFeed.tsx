"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { loadMoreFeed } from "@/app/(app)/feed-actions";
import { cursorOf, type FeedParams, type FeedPost } from "@/lib/feed/types";
import { PostCard } from "./PostCard";
import { EcgLoader } from "@/components/brand/Ecg";
import { EmptyState } from "@/components/ui/EmptyState";

const PAGE = 10;

export function InfiniteFeed({
  initial,
  params,
  canModerate,
  emptyTitle = "Aucune publication",
  emptyDescription,
}: {
  initial: FeedPost[];
  params: FeedParams;
  canModerate: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const [posts, setPosts] = useState(initial);
  const [done, setDone] = useState(initial.length < PAGE);
  const [pending, startTransition] = useTransition();
  const sentinel = useRef<HTMLDivElement>(null);
  const key = JSON.stringify(params);

  // Nouveau filtre → on repart de la première page reçue du serveur.
  useEffect(() => {
    setPosts(initial);
    setDone(initial.length < PAGE);
  }, [initial, key]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || done) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || pending) return;
        startTransition(async () => {
          const more = await loadMoreFeed(params, cursorOf(posts));
          setPosts((p) => {
            const seen = new Set(p.map((x) => x.id));
            return [...p, ...more.filter((x) => !seen.has(x.id))];
          });
          if (more.length < PAGE) setDone(true);
        });
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [posts, done, pending, params]);

  if (posts.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="space-y-0 sm:space-y-4">
      {posts.map((p) => (
        <PostCard key={p.id} post={p} canModerate={canModerate} />
      ))}
      <div ref={sentinel} aria-hidden="true" />
      {pending && <EcgLoader />}
      {done && posts.length >= PAGE && (
        <p className="py-6 text-center text-xs text-muted">Vous êtes à jour.</p>
      )}
    </div>
  );
}
