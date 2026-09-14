"use client";

import { lockScroll, unlockScroll } from "@/lib/dom/scroll-lock";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import { MoreHorizontal, Volume2, VolumeX, X } from "lucide-react";
import type { StoryGroup, StoryItem } from "@/lib/feed/types";
import { fetchStoryItems, recordStoryView } from "@/app/(app)/story-actions";
import { formatRelative } from "@/lib/format";
import { imageSrc, posterSrc } from "@/lib/media/url";
import { SPRING } from "@/lib/motion";
import { cn } from "@/lib/cn";
import { StoryMedia } from "./StoryMedia";
import { StoryReplyBar } from "./StoryReplyBar";
import { videoSrc } from "@/lib/media/url";

/**
 * Viewer plein écran : fond #000, barres de progression 2 px, tap droite/gauche,
 * maintien pour pause, swipe horizontal pour changer de série, swipe vertical
 * pour fermer. Les vues sont enregistrées à l'affichage.
 */
export function StoryViewer({
  groups,
  startIndex,
  onClose,
  canEdit,
}: {
  groups: StoryGroup[];
  startIndex: number;
  onClose: () => void;
  canEdit: boolean;
}) {
  const [gi, setGi] = useState(startIndex);
  const [si, setSi] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [items, setItems] = useState<Record<string, StoryItem[]>>({});
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pressStart = useRef<number>(0);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seen = useRef(new Set<string>());
  const reduced = useReducedMotion();

  const group = groups[gi];
  const list = items[`${group.kind}-${group.id}`];
  const story = list?.[si] ?? null;

  // Chargement des stories du groupe courant (et préchargement du suivant)
  useEffect(() => {
    const key = `${group.kind}-${group.id}`;
    if (!items[key]) {
      fetchStoryItems(group).then((data) => setItems((prev) => ({ ...prev, [key]: data })));
    }
    const next = groups[gi + 1];
    if (next && !items[`${next.kind}-${next.id}`]) {
      fetchStoryItems(next).then((data) => setItems((prev) => ({ ...prev, [`${next.kind}-${next.id}`]: data })));
    }
  }, [gi, group, groups, items]);

  // Verrouillage du défilement de la page
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    lockScroll();
    return () => {
      unlockScroll();
      opener?.focus?.({ preventScroll: true });
    };
  }, []);

  const goGroup = useCallback(
    (delta: 1 | -1) => {
      const target = gi + delta;
      if (target < 0) {
        setSi(0);
        return;
      }
      if (target >= groups.length) {
        onClose();
        return;
      }
      setDir(delta);
      setGi(target);
      setSi(0);
      setProgress(0);
    },
    [gi, groups.length, onClose],
  );

  // Groupe sans story lisible (expirée entre-temps, erreur) : on passe au suivant
  useEffect(() => {
    if (list && list.length === 0) {
      const t = setTimeout(() => goGroup(1), 0);
      return () => clearTimeout(t);
    }
  }, [list, goGroup]);

  const next = useCallback(() => {
    if (!list) return;
    if (si + 1 < list.length) {
      setSi(si + 1);
      setProgress(0);
    } else goGroup(1);
  }, [list, si, goGroup]);

  const prev = useCallback(() => {
    if (si > 0) {
      setSi(si - 1);
      setProgress(0);
    } else goGroup(-1);
  }, [si, goGroup]);

  // Vue enregistrée à l'affichage
  useEffect(() => {
    if (story && !seen.current.has(story.id)) {
      seen.current.add(story.id);
      recordStoryView(story.id);
    }
  }, [story]);

  // Minuterie des images (les vidéos pilotent la barre via timeupdate)
  useEffect(() => {
    if (!story || story.media?.kind === "video") return;
    const duration = Math.max(3, story.display_seconds) * 1000;
    let raf = 0;
    let last = performance.now();
    let elapsed = progress * duration;
    const tick = (now: number) => {
      if (!paused) {
        elapsed += now - last;
        const p = Math.min(1, elapsed / duration);
        setProgress(p);
        if (p >= 1) {
          next();
          return;
        }
      }
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- relance uniquement au changement de story / pause
  }, [story?.id, paused]);

  // Pause / reprise de la vidéo
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (paused) v.pause();
    else v.play().catch(() => {});
  }, [paused, story?.id]);

  // Clavier
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
      if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [next, prev, onClose]);

  // Tap court = navigation, maintien = pause
  function onPointerDown() {
    pressStart.current = Date.now();
    holdTimer.current = setTimeout(() => setPaused(true), 180);
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    const held = Date.now() - pressStart.current > 180;
    setPaused(false);
    if (held) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientX - rect.left < rect.width * 0.3) prev();
    else next();
  }
  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.y > 90 && Math.abs(info.offset.x) < 60) {
      onClose();
      return;
    }
    if (info.offset.x < -70) goGroup(1);
    else if (info.offset.x > 70) goGroup(-1);
  }

  const cover = group.cover;

  return (
    <div className="fixed inset-0 z-[70] flex min-h-dvh items-center justify-center overflow-clip bg-black" role="dialog" aria-modal="true" aria-label={`Stories : ${group.title}`}>
      <AnimatePresence mode="wait" initial={false} custom={dir}>
        <motion.div
          key={`${group.kind}-${group.id}`}
          custom={dir}
          initial={reduced ? false : { x: dir * 60, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -dir * 60, opacity: 0, transition: { duration: 0.16 } }}
          transition={SPRING}
          drag={reduced ? false : true}
          dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
          dragElastic={0.35}
          onDragEnd={onDragEnd}
          className="relative h-full w-full max-w-[calc(100dvh*9/16)] overflow-hidden bg-black sm:h-[92dvh] sm:rounded-[22px]"
        >
          {/* Média + zones tactiles */}
          <div className="absolute inset-0" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => setPaused(false)}>
            {story ? (
              <>
                {list?.[si + 1]?.media?.kind === "video" && (
                  // Préchargement discret de la story suivante (vidéo) pour un enchaînement sans attente
                  <video src={videoSrc(list[si + 1].media!)} preload="auto" muted playsInline aria-hidden="true" tabIndex={-1} className="hidden" />
                )}
                <StoryMedia
                  key={story.id}
                  media={story.media}
                  overlay={story.overlay}
                  videoRef={videoRef}
                  muted={muted}
                  playing={!paused}
                  onVideoTime={setProgress}
                  onVideoEnded={next}
                />
              </>
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-[1.75px] border-white/30 border-t-white" aria-label="Chargement" />
              </div>
            )}
          </div>

          {/* Barres de progression 2 px */}
          <div className="pointer-events-none absolute inset-x-3 top-[max(env(safe-area-inset-top),12px)] flex gap-1" aria-hidden="true">
            {(list ?? [null]).map((_, i) => (
              <span key={i} className="h-[2px] flex-1 overflow-hidden rounded-full bg-white/30">
                <span className="block h-full bg-white" style={{ width: i < si ? "100%" : i === si ? `${Math.round(progress * 100)}%` : "0%" }} />
              </span>
            ))}
          </div>

          {/* En-tête : vignette, titre, temps, fermer */}
          <div className="pointer-events-none absolute inset-x-3 top-[calc(max(env(safe-area-inset-top),12px)+12px)] flex items-center gap-3">
            <span className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-white/10">
              {cover && (
                // eslint-disable-next-line @next/next/no-img-element -- vignette
                <img src={cover.kind === "video" ? posterSrc(cover) : imageSrc(cover, "thumb")} alt="" className="h-full w-full object-cover" />
              )}
            </span>
            <span className="min-w-0 flex-1 leading-tight [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
              <span className="block truncate text-[15px] font-semibold text-white">{group.title}</span>
              {story?.published_at && <span className="block text-[13px] text-white/70">{formatRelative(story.published_at)}</span>}
            </span>
            {canEdit && story && (
              <Link
                href={`/studio/stories/${story.id}`}
                aria-label="Modifier dans le Studio"
                className="pointer-events-auto flex h-10 w-10 items-center justify-center text-white/90"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal size={22} strokeWidth={1.75} />
              </Link>
            )}
            <button type="button" onClick={onClose} aria-label="Fermer" className="pointer-events-auto flex h-10 w-10 items-center justify-center text-white/90">
              <X size={24} strokeWidth={1.75} />
            </button>
          </div>

          {/* Réponses : réactions rapides + message au service communication */}
          {story && (
            <div className="pointer-events-none absolute inset-x-3 bottom-[max(env(safe-area-inset-bottom),12px)]">
              <StoryReplyBar storyId={story.id} onFocusChange={setPaused} />
            </div>
          )}

          {/* Lien, vues (éditeurs), son */}
          <div className="pointer-events-none absolute inset-x-4 bottom-[calc(max(env(safe-area-inset-bottom),12px)+112px)] flex items-end justify-between gap-3">
            <div className="flex flex-col items-start gap-2">
              {canEdit && story && (
                <span className="text-[13px] text-white/70 [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
                  {story.views} {story.views > 1 ? "vues" : "vue"}
                </span>
              )}
              {story?.link_post && (
                <Link
                  href={`/post/${story.link_post.slug}`}
                  onClick={onClose}
                  className="pointer-events-auto glass rounded-full px-4 py-2 text-[15px] font-medium text-white"
                >
                  Voir la publication
                </Link>
              )}
            </div>
            {story?.media?.kind === "video" && (
              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                aria-label={muted ? "Activer le son" : "Couper le son"}
                aria-pressed={!muted}
                className={cn("pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white/90")}
              >
                {muted ? <VolumeX size={18} strokeWidth={1.75} /> : <Volume2 size={18} strokeWidth={1.75} />}
              </button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
