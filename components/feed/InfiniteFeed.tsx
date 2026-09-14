"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { loadMoreFeed } from "@/app/(app)/feed-actions";
import { cursorOf, type FeedParams, type FeedPost } from "@/lib/feed/types";
import { SPRING } from "@/lib/motion";
import { PostCard } from "./PostCard";
import { PostSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";

const PAGE = 10;

/**
 * Fil infini. Une seule animation orchestrée : à l'arrivée, les cartes de la
 * première page montent de 8 px en cascade (40 ms). Les pages suivantes
 * apparaissent sans effet.
 */
export function InfiniteFeed({
  initial,
  hasMore,
  params,
  canModerate,
  emptyTitle = "Aucune publication",
  emptyDescription,
}: {
  initial: FeedPost[];
  /** La page serveur était-elle pleine ? (les épinglés sont retirés de `initial`) */
  hasMore?: boolean;
  params: FeedParams;
  canModerate: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const more = hasMore ?? initial.length >= PAGE;
  const [posts, setPosts] = useState(initial);
  const [done, setDone] = useState(!more);
  const [pending, startTransition] = useTransition();
  const sentinel = useRef<HTMLDivElement>(null);
  const firstIds = useRef(new Set(initial.map((p) => p.id)));
  const reduced = useReducedMotion();
  const key = JSON.stringify(params);

  useEffect(() => {
    setPosts(initial);
    setDone(!more);
    firstIds.current = new Set(initial.map((p) => p.id));
  }, [initial, key, more]);

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
    <div className="space-y-3">
      {posts.map((p, i) => {
        const cascade = !reduced && firstIds.current.has(p.id);
        return (
          <motion.div
            key={p.id}
            initial={cascade ? { opacity: 0, y: 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: cascade ? Math.min(i, 8) * 0.04 : 0 }}
          >
            <PostCard post={p} canModerate={canModerate} />
          </motion.div>
        );
      })}
      <div ref={sentinel} aria-hidden="true" />
      {pending && <PostSkeleton />}
      {done && posts.length >= PAGE && <p className="py-6 text-center text-[13px] text-text-3">Vous êtes à jour.</p>}
    </div>
  );
}
