"use client";

import { useEffect, useRef } from "react";
import { ChevronLeft } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import type { FeedPost } from "@/lib/feed/types";
import { SPRING } from "@/lib/motion";
import { lockScroll, unlockScroll } from "@/lib/dom/scroll-lock";
import { ViewTracker } from "@/app/(app)/post/[slug]/ViewTracker";
import { PostCard } from "./PostCard";

/**
 * Publication en exergue, ouverte instantanément depuis le fil avec les
 * données déjà chargées (aucun aller-retour serveur). L'URL passe sur
 * /post/<slug> via l'historique : le bouton Retour du téléphone referme la
 * vue, et un rechargement tombe sur la vraie page.
 */
export function PostOverlay({ post, canModerate, onClose }: { post: FeedPost; canModerate: boolean; onClose: () => void }) {
  const reduced = useReducedMotion();
  const pushed = useRef(false);
  const closing = useRef(false);

  useEffect(() => {
    lockScroll();
    const href = `/post/${post.slug}`;
    const previous = window.location.pathname + window.location.search;
    window.history.pushState({ atlasOverlay: true }, "", href);
    pushed.current = true;
    const onPop = () => {
      closing.current = true;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const close = () => {
      if (pushed.current && !closing.current) {
        closing.current = true;
        window.history.back();
      } else onClose();
    };
    window.addEventListener("popstate", onPop);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("keydown", onKey);
      unlockScroll();
      // Fermeture sans passer par l'historique (ex. démontage) : on restaure l'URL du fil
      if (pushed.current && !closing.current && window.location.pathname === href) {
        window.history.replaceState(null, "", previous);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- montage unique par publication
  }, [post.slug]);

  function requestClose() {
    if (pushed.current && !closing.current) {
      closing.current = true;
      window.history.back();
    } else onClose();
  }

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={post.title ?? "Publication"}
      className="fixed inset-0 z-[45] min-h-dvh overflow-y-auto overscroll-contain bg-bg-0"
      initial={reduced ? false : { x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%", transition: { duration: 0.2 } }}
      transition={SPRING}
    >
      <header className="glass fixed inset-x-0 top-0 z-10" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="relative mx-auto flex h-12 max-w-[680px] items-center px-3 sm:px-8">
          <button type="button" onClick={requestClose} className="pressable -ml-1 flex h-12 items-center gap-0.5 pr-2 text-[15px] font-medium text-text-2 hover:text-text-1" aria-label="Retour">
            <ChevronLeft size={22} strokeWidth={1.75} />
            Retour
          </button>
          <span className="pointer-events-none absolute inset-x-24 truncate text-center text-[17px] font-semibold tracking-[-0.02em] text-text-1">{post.title ?? "Publication"}</span>
        </div>
      </header>
      <div className="mx-auto w-full max-w-[680px] px-3 pb-[max(env(safe-area-inset-bottom),24px)] pt-[calc(48px+env(safe-area-inset-top)+8px)] sm:px-8">
        <ViewTracker postId={post.id} />
        <PostCard post={post} variant="full" canModerate={canModerate} />
      </div>
    </motion.div>
  );
}
