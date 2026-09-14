"use client";

import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import { SPRING } from "@/lib/motion";

/**
 * Bottom sheet 22 px avec poignée (mobile) / panneau centré 480 px (desktop).
 * Voile rgba(0,0,0,.5) + blur 4 px ; fermeture au swipe et au tap sur le voile.
 * Pose data-sheet-open sur <html> : les barres en verre passent en opaque.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.setAttribute("data-sheet-open", "");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      document.documentElement.removeAttribute("data-sheet-open");
    };
  }, [open, onClose]);

  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.y > 80 || info.velocity.y > 600) onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="veil"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[4px] sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.18 } }}
          onClick={onClose}
          role="presentation"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={(e) => e.stopPropagation()}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={onDragEnd}
            initial={reduced ? false : { y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%", transition: { duration: 0.22 } }}
            transition={SPRING}
            className="floating flex max-h-[88dvh] w-full flex-col rounded-t-[22px] sm:max-h-[80vh] sm:w-[480px] sm:rounded-[22px]"
          >
            <div className="flex shrink-0 cursor-grab touch-none flex-col items-center pt-2">
              <span className="h-[5px] w-9 rounded-full bg-white/20" aria-hidden="true" />
              <div className="flex h-12 w-full items-center px-5">
                <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">{title}</h2>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
