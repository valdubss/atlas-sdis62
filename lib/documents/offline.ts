"use client";

import { OFFLINE_DOCS_CACHE, OFFLINE_DOCS_KEY } from "./types";

/**
 * Documents gardés hors ligne : le fichier est copié dans le cache du navigateur sous la
 * clé same-origin `/documents/f/<id>` (celle que le service worker sert en priorité), et
 * l'identifiant est noté sur l'appareil. Tout échec est silencieux : la fonction renvoie
 * simplement false.
 */
export function offlineKey(id: string) {
  return `/documents/f/${id}`;
}

export function readOfflineIds(): Set<string> {
  try {
    const raw = localStorage.getItem(OFFLINE_DOCS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeOfflineIds(ids: Set<string>) {
  try {
    localStorage.setItem(OFFLINE_DOCS_KEY, JSON.stringify([...ids]));
  } catch {
    /* stockage indisponible */
  }
}

export async function saveOffline(id: string, fileUrl: string, mime: string): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  try {
    const res = await fetch(fileUrl, { mode: "cors", credentials: "omit" });
    if (!res.ok) return false;
    const body = await res.blob();
    const cache = await caches.open(OFFLINE_DOCS_CACHE);
    await cache.put(offlineKey(id), new Response(body, { headers: { "content-type": mime, "content-disposition": "inline", "x-atlas-offline": "1" } }));
    const ids = readOfflineIds();
    ids.add(id);
    writeOfflineIds(ids);
    return true;
  } catch {
    return false;
  }
}

export async function removeOffline(id: string): Promise<void> {
  try {
    if (typeof caches !== "undefined") await (await caches.open(OFFLINE_DOCS_CACHE)).delete(offlineKey(id));
  } catch {
    /* ignoré */
  }
  const ids = readOfflineIds();
  ids.delete(id);
  writeOfflineIds(ids);
}

/** Vérifie que les fichiers notés sont bien en cache (un nettoyage du navigateur peut les avoir retirés). */
export async function verifyOffline(): Promise<Set<string>> {
  const ids = readOfflineIds();
  if (typeof caches === "undefined") return ids;
  try {
    const cache = await caches.open(OFFLINE_DOCS_CACHE);
    const kept = new Set<string>();
    for (const id of ids) if (await cache.match(offlineKey(id))) kept.add(id);
    if (kept.size !== ids.size) writeOfflineIds(kept);
    return kept;
  } catch {
    return ids;
  }
}
