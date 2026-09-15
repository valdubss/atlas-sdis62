"use client";

import { useSyncExternalStore } from "react";

/**
 * File d'envois visible dans le studio : chaque média en préparation, envoi ou
 * traitement y est publié par l'uploader ; le bandeau la lit. Les envois se
 * poursuivent pendant la rédaction tant que la page reste ouverte.
 */
export type QueueItem = { id: string; name: string; kind: "image" | "video"; status: "preparing" | "uploading" | "processing" | "ready" | "error"; progress: number; error?: string };

let items: QueueItem[] = [];
const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}

export const uploadQueue = {
  upsert(item: QueueItem) {
    const i = items.findIndex((x) => x.id === item.id);
    items = i >= 0 ? items.map((x, j) => (j === i ? { ...x, ...item } : x)) : [...items, item];
    emit();
    if (item.status === "ready") setTimeout(() => uploadQueue.remove(item.id), 4000);
  },
  rename(oldId: string, newId: string) {
    items = items.map((x) => (x.id === oldId ? { ...x, id: newId } : x));
    emit();
  },
  remove(id: string) {
    items = items.filter((x) => x.id !== id);
    emit();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get() {
    return items;
  },
};

const EMPTY: QueueItem[] = [];
export function useUploadQueue() {
  return useSyncExternalStore(uploadQueue.subscribe, uploadQueue.get, () => EMPTY);
}

/** Avertit avant de quitter la page tant qu'un envoi est en cours. */
export function installUnloadGuard() {
  if (typeof window === "undefined") return () => {};
  const handler = (e: BeforeUnloadEvent) => {
    if (items.some((i) => i.status === "uploading" || i.status === "preparing")) {
      e.preventDefault();
      e.returnValue = "";
    }
  };
  window.addEventListener("beforeunload", handler);
  return () => window.removeEventListener("beforeunload", handler);
}
