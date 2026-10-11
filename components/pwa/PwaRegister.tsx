"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { SW_URL } from "@/lib/push/client";

/**
 * Enregistre le service worker (cache de l'interface, réception des push) et signale une
 * nouvelle version : chaque déploiement change l'adresse du worker (`?v=version-build`),
 * le nouveau worker s'installe, prend la main (skipWaiting + claim) et `controllerchange`
 * déclenche la bulle « Nouvelle version » ; un toucher recharge la page. Le worker est
 * revérifié au retour au premier plan et toutes les 30 minutes.
 */
export function PwaRegister() {
  const [fresh, setFresh] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production" && !process.env.NEXT_PUBLIC_SW_DEV) return;
    const sw = navigator.serviceWorker;
    const hadController = Boolean(sw.controller);
    let registration: ServiceWorkerRegistration | null = null;
    sw.register(SW_URL, { scope: "/" })
      .then((r) => {
        registration = r;
      })
      .catch(() => {});
    const onChange = () => {
      // Première installation : rien à signaler ; remplacement d'un worker : nouvelle version
      if (hadController) setFresh(true);
    };
    sw.addEventListener("controllerchange", onChange);
    const check = () => registration?.update().catch(() => {});
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(check, 30 * 60_000);
    return () => {
      sw.removeEventListener("controllerchange", onChange);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, []);

  if (!fresh) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(env(safe-area-inset-top),12px)] z-[70] flex justify-center px-5">
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="glass pressable pointer-events-auto flex h-11 items-center gap-2 rounded-[14px] border border-glass-edge px-4 text-[15px] font-medium text-text-1"
      >
        <RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" />
        Nouvelle version disponible · Recharger
      </button>
    </div>
  );
}
