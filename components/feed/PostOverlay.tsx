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
 * données déjà chargées (aucun aller-retour serveur). Une entrée d'historique
 * est ajoutée pour que le bouton Retour du téléphone referme la vue ; le
 * partage et les liens utilisent toujours la page /post/<slug>.
 */
export function PostOverlay({
  post,
  canModerate,
  onClose,
}: {
  post: FeedPost;
  canModerate: boolean;
  onClose: (viaHistory: boolean) => void;
}) {
  const reduced = useReducedMotion();
  const pushed = useRef(false);
  const closing = useRef(false);
  // Fermeture demandée par la vue elle-même (bouton, Échap) : on garde l'animation de sortie
  const manual = useRef(false);

  useEffect(() => {
    lockScroll();
    // Entrée d'historique sans changement d'URL : le routeur Next ne déclenche
    // aucune navigation, et le bouton Retour du téléphone referme la vue.
    window.history.pushState(
      { ...(window.history.state ?? {}), atlasOverlay: true },
      "",
    );
    pushed.current = true;
    const onPop = () => {
      // Retour du téléphone (geste ou bouton) : le système a déjà animé la
      // sortie, la vue disparaît sans rejouer la sienne.
      closing.current = true;
      onClose(!manual.current);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const close = () => {
      if (pushed.current && !closing.current) {
        closing.current = true;
        manual.current = true;
        window.history.back();
      } else onClose(false);
    };
    window.addEventListener("popstate", onPop);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("keydown", onKey);
      unlockScroll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- montage unique par publication
  }, [post.slug]);

  function requestClose() {
    if (pushed.current && !closing.current) {
      closing.current = true;
      manual.current = true;
      window.history.back();
    } else onClose(false);
  }

  return (
    // Enveloppe fixe non animée et découpée : le panneau qui glisse depuis la
    // droite ne peut pas élargir la page (Safari iOS la rendait « pannable »).
    <div className="fixed inset-0 z-[45] overflow-clip">
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={post.title ?? "Publication"}
        className="absolute inset-0 overflow-y-auto overscroll-contain bg-bg-0"
        initial={reduced ? false : { x: "100%" }}
        animate={{ x: 0 }}
        variants={{
          exit: (instant: boolean) =>
            instant
              ? { opacity: 0, transition: { duration: 0 } }
              : { x: "100%", transition: { duration: 0.2 } },
        }}
        exit="exit"
        transition={SPRING}
      >
        <header
          className="glass fixed inset-x-0 top-0 z-10"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <div className="relative mx-auto flex h-12 max-w-[680px] items-center px-3 sm:px-8">
            <button
              type="button"
              onClick={requestClose}
              className="pressable -ml-1 flex h-12 items-center gap-0.5 pr-2 text-[15px] font-medium text-text-2 hover:text-text-1"
              aria-label="Retour"
            >
              <ChevronLeft size={22} strokeWidth={1.75} />
              Retour
            </button>
            <span className="pointer-events-none absolute inset-x-24 truncate text-center text-[17px] font-semibold tracking-[-0.02em] text-text-1">
              {post.title ?? "Publication"}
            </span>
          </div>
        </header>
        <div className="mx-auto w-full max-w-[680px] px-3 pb-[max(env(safe-area-inset-bottom),24px)] pt-[calc(48px+env(safe-area-inset-top)+8px)] sm:px-8">
          <ViewTracker postId={post.id} />
          <PostCard post={post} variant="full" canModerate={canModerate} />
        </div>
      </motion.div>
    </div>
  );
}
