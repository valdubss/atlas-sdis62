"use client";

import { lockScroll, unlockScroll } from "@/lib/dom/scroll-lock";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import { SPRING } from "@/lib/motion";
import { cn } from "@/lib/cn";

/**
 * Bottom sheet 22 px avec poignée (mobile) / panneau centré 480 px (desktop).
 * Voile rgba(0,0,0,.5) + blur 4 px ; fermeture au swipe et au tap sur le voile.
 * Pose data-sheet-open sur <html> : les barres en verre passent en opaque.
 *
 * `tall` : hauteur fixe (≈ 85 % de l'écran) façon Instagram, pour les listes
 * qui se remplissent (commentaires). `scroll={false}` : l'enfant gère lui-même
 * son défilement (liste + composeur épinglé). Sur mobile, la feuille suit le
 * clavier grâce à visualViewport.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  tall = false,
  scroll = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  tall?: boolean;
  scroll?: boolean;
}) {
  const reduced = useReducedMotion();
  const keyboard = useKeyboardInset(open);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const focusable = () =>
      Array.from(
        document.querySelectorAll<HTMLElement>('[role="dialog"] a[href], [role="dialog"] button:not([disabled]), [role="dialog"] textarea, [role="dialog"] input, [role="dialog"] select, [role="dialog"] [tabindex]:not([tabindex="-1"])'),
      );
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        // Le focus reste dans la feuille (piège clavier)
        const items = focusable();
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    lockScroll();
    document.documentElement.setAttribute("data-sheet-open", "");
    const t = setTimeout(() => {
      if (!document.querySelector('[role="dialog"]')?.contains(document.activeElement)) focusable()[0]?.focus({ preventScroll: true });
    }, 60);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      unlockScroll();
      document.documentElement.removeAttribute("data-sheet-open");
      opener?.focus?.({ preventScroll: true });
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
          className="fixed inset-0 z-50 flex min-h-dvh items-end justify-center bg-black/50 backdrop-blur-[4px] sm:items-center sm:p-6"
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
            style={keyboard.inset ? { marginBottom: keyboard.inset, maxHeight: keyboard.height } : undefined}
            className={cn(
              "floating flex w-full flex-col rounded-t-[22px] sm:w-[480px] sm:rounded-[22px]",
              tall ? "h-[85dvh] sm:h-[80vh]" : "max-h-[88dvh] sm:max-h-[80vh]",
            )}
          >
            <div className="flex shrink-0 cursor-grab touch-none flex-col items-center pt-2">
              <span className="h-[5px] w-9 rounded-full bg-white/20" aria-hidden="true" />
              <div className="flex h-12 w-full items-center px-5">
                <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-text-1">{title}</h2>
              </div>
            </div>
            {scroll ? (
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">{children}</div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Hauteur du clavier virtuel (iOS Safari ne réduit pas la fenêtre, seulement
 * le visualViewport) : la feuille remonte d'autant et sa hauteur est bornée.
 */
function useKeyboardInset(active: boolean) {
  const [state, setState] = useState({ inset: 0, height: 0 });
  useEffect(() => {
    if (!active) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      setState({ inset: inset > 60 ? inset : 0, height: Math.round(vv.height) });
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      setState({ inset: 0, height: 0 });
    };
  }, [active]);
  return state;
}
