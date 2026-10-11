"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { SPRING } from "@/lib/motion";

type Toast = { id: number; text: string };

const ToastContext = createContext<(text: string, durationMs?: number) => void>(() => {});

/** Toast en verre, 44 px, une ligne, glisse depuis le haut, disparaît en 2,5 s (durée ajustable). */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduced = useReducedMotion();

  const show = useCallback((text: string, durationMs = 2500) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), text });
    timer.current = setTimeout(() => setToast(null), durationMs);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-[max(env(safe-area-inset-top),12px)] z-[60] flex justify-center px-5">
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.id}
              role="status"
              aria-live="polite"
              initial={reduced ? false : { y: -24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -16, opacity: 0, transition: { duration: 0.18 } }}
              transition={SPRING}
              className="glass flex h-11 max-w-[420px] items-center rounded-[14px] border border-glass-edge px-4 text-[15px] text-text-1"
            >
              <span className="truncate">{toast.text}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
