"use client";

import { useEffect } from "react";
import { useToast } from "@/components/ui/Toast";

const TEXTS: Record<string, string> = {
  publication: "Publication en ligne ✓",
  story: "Story en ligne ✓",
  programmee: "Publication programmée ✓",
  attente: "Envoi en cours : la publication partira toute seule ✓",
};

/**
 * Bulle « publié » à l'arrivée sur le fil après une publication depuis le Studio
 * (`/?publie=publication|story|programmee`) ; le paramètre est retiré de l'adresse aussitôt,
 * pour qu'un rechargement ou un retour arrière ne la réaffiche pas.
 */
export function PublishedToast({ kind }: { kind: string }) {
  const toast = useToast();
  useEffect(() => {
    const text = TEXTS[kind];
    if (!text) return;
    // Confirmation importante : affichée 4 s, le temps que le fil se mette en place
    toast(text, 4000);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("publie");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    } catch {
      /* adresse non modifiable : sans importance */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une fois à l'arrivée
  }, [kind]);
  return null;
}
