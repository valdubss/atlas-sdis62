"use client";

import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import { SPRING } from "@/lib/motion";

/**
 * Lightbox plein écran : la photo grandit depuis sa position (layoutId partagé),
 * le fond fond en noir, fermeture au swipe vertical avec suivi du doigt.
 */
export function Lightbox({
  open,
  src,
  alt,
  layoutId,
  onClose,
  caption,
}: {
  open: boolean;
  src: string;
  alt: string;
  layoutId: string;
  onClose: () => void;
  caption?: React.ReactNode;
}) {
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  function onDragEnd(_: unknown, info: PanInfo) {
    if (Math.abs(info.offset.y) > 90 || Math.abs(info.velocity.y) > 700) onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[55] flex items-center justify-center bg-black"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={alt || "Photo"}
        >
          <motion.img
            layoutId={reduced ? undefined : layoutId}
            src={src}
            alt={alt}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.8}
            onDragEnd={onDragEnd}
            transition={SPRING}
            className="max-h-full max-w-full select-none object-contain"
            onClick={(e) => e.stopPropagation()}
            draggable={false}
          />
          {caption && (
            <div className="pointer-events-none absolute inset-x-0 bottom-[max(env(safe-area-inset-bottom),20px)] flex justify-center px-5" onClick={(e) => e.stopPropagation()}>
              {caption}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
