"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * Panneau bas (bottom sheet) façon Instagram sur mobile, dialogue centré sur
 * desktop. Ferme sur Échap, clic sur le fond ou glissement vers le bas de la poignée.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<number | null>(null);

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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "glass-strong flex max-h-[88dvh] w-full flex-col rounded-t-3xl border-b-0 shadow-soft sm:max-h-[80vh] sm:max-w-lg sm:rounded-3xl sm:border-b",
          "animate-[sheet-in_.22s_ease-out]",
          className,
        )}
      >
        <div
          className="flex shrink-0 cursor-grab touch-none flex-col items-center pt-2"
          onTouchStart={(e) => (dragStart.current = e.touches[0].clientY)}
          onTouchEnd={(e) => {
            const start = dragStart.current;
            dragStart.current = null;
            if (start !== null && e.changedTouches[0].clientY - start > 70) onClose();
          }}
        >
          <span className="h-1.5 w-10 rounded-full bg-line-strong" aria-hidden="true" />
          <div className="flex w-full items-center justify-between px-4 pb-2 pt-3">
            <h2 className="font-display text-lg font-bold uppercase text-ink">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="-mr-2 rounded-full p-2 text-muted hover:bg-surface-2 hover:text-navy"
              aria-label="Fermer"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  );
}
