"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Sheet } from "./Sheet";
import { Button } from "./Button";

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Action destructrice : bouton rouge */
  danger?: boolean;
};

type Ask = (opts: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<Ask>(() => Promise.resolve(false));

/**
 * Confirmation maison (feuille basse) à la place de window.confirm : même
 * langage visuel que le reste de l'app, lisible en thème clair comme sombre,
 * boutons de 44 px. `const confirm = useConfirm(); if (!(await confirm("…"))) return;`
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const ask = useCallback<Ask>((o) => {
    const options = typeof o === "string" ? { title: o } : o;
    return new Promise<boolean>((resolve) => {
      resolver.current?.(false);
      resolver.current = resolve;
      setOpts(options);
    });
  }, []);

  function settle(v: boolean) {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  }

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <Sheet open={opts !== null} onClose={() => settle(false)} title={opts?.title ?? ""}>
        {opts && (
          <div className="space-y-4 px-5 pb-[max(env(safe-area-inset-bottom),20px)]">
            {opts.message && <p className="text-[15px] leading-[1.45] text-text-2">{opts.message}</p>}
            <div className="flex gap-3">
              <Button type="button" variant={opts.danger ? "danger" : "primary"} className="flex-1" onClick={() => settle(true)} autoFocus>
                {opts.confirmLabel ?? "Confirmer"}
              </Button>
              <Button type="button" variant="secondary" className="flex-1" onClick={() => settle(false)}>
                {opts.cancelLabel ?? "Annuler"}
              </Button>
            </div>
          </div>
        )}
      </Sheet>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Ask {
  return useContext(ConfirmContext);
}
