"use client";

import { useEffect } from "react";
import { recordView } from "@/app/(app)/feed-actions";

/** Enregistre une vue unique (post, utilisateur) à l'ouverture de la page. */
export function ViewTracker({ postId }: { postId: string }) {
  useEffect(() => {
    recordView(postId);
  }, [postId]);
  return null;
}
