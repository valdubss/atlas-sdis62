"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const KEY = "atlas:dirty";

/** Signale qu'une page mise en cache par le routeur doit être rechargée à la prochaine visite. */
export function markDirty(page: string) {
  try {
    const set = new Set((sessionStorage.getItem(KEY) ?? "").split(",").filter(Boolean));
    set.add(page);
    sessionStorage.setItem(KEY, [...set].join(","));
  } catch {
    /* stockage indisponible : la page se rafraîchira au prochain chargement complet */
  }
}

/**
 * Posé sur une page : si elle a été marquée « à rafraîchir » (ex. favori ajouté
 * depuis le fil), recharge ses données serveur une fois, sans clignotement.
 */
export function RefreshWhenDirty({ page }: { page: string }) {
  const router = useRouter();
  useEffect(() => {
    try {
      const set = new Set((sessionStorage.getItem(KEY) ?? "").split(",").filter(Boolean));
      if (!set.has(page)) return;
      set.delete(page);
      sessionStorage.setItem(KEY, [...set].join(","));
    } catch {
      return;
    }
    router.refresh();
  }, [page, router]);
  return null;
}
