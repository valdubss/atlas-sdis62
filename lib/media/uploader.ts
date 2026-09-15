"use client";

import { LIMITS } from "@/lib/config";

/**
 * Envoi d'un fichier vers le stockage, avec reprise après coupure :
 *  - Supabase Storage : protocole TUS (morceaux de 6 Mo, seule taille acceptée),
 *    reprise automatique grâce à l'empreinte du fichier (tus-js-client) ;
 *  - S3 / R2 : multipart par morceaux de 8 Mo, chaque partie signée par le
 *    serveur, état de reprise gardé localement ;
 *  - repli : PUT signé en un seul envoi.
 */
export type UploadTarget =
  | { mode: "put"; url: string; headers: Record<string, string> }
  | { mode: "tus"; endpoint: string; bucket: string; objectName: string; token: string; mime: string }
  | { mode: "multipart"; key: string; mime: string; uploadId: string; partSize: number };

export type MultipartApi = {
  presignPart: (key: string, uploadId: string, partNumber: number) => Promise<{ ok: true; url: string } | { ok: false; error: string }>;
  complete: (key: string, uploadId: string, parts: { partNumber: number; etag: string }[]) => Promise<{ ok: boolean; error?: string }>;
};

const mb = (n: number) => `${Math.round(n / 1048576)} Mo`;

function putXhr(url: string, headers: Record<string, string>, blob: Blob, onProgress: (f: number) => void): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve(xhr.getResponseHeader("ETag"))
        : reject(new Error(xhr.status === 413 ? `Fichier trop lourd pour l'espace de stockage (limite : ${mb(LIMITS.uploadMaxBytes)} par fichier).` : `Envoi refusé par le stockage (${xhr.status}).`));
    xhr.onerror = () => reject(new Error("Envoi interrompu. Vérifiez votre connexion."));
    xhr.send(blob);
  });
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await new Promise<void>((r) => window.addEventListener("online", () => r(), { once: true }));
      } else await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw last;
}

export async function uploadFile(target: UploadTarget, blob: Blob, onProgress: (fraction: number) => void, api?: MultipartApi, fingerprint?: string | null): Promise<void> {
  if (target.mode === "put") {
    await withRetry(() => putXhr(target.url, target.headers, blob, onProgress));
    return;
  }

  if (target.mode === "tus") {
    const { Upload } = await import("tus-js-client");
    await new Promise<void>((resolve, reject) => {
      const upload = new Upload(blob, {
        endpoint: target.endpoint,
        retryDelays: [0, 1000, 3000, 5000, 10000],
        chunkSize: 6 * 1024 * 1024,
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        headers: { authorization: `Bearer ${target.token}`, "x-upsert": "true" },
        metadata: { bucketName: target.bucket, objectName: target.objectName, contentType: target.mime, cacheControl: "31536000" },
        fingerprint: async () => `atlas-tus-${fingerprint ?? `${blob.size}-${target.objectName}`}`,
        onError: (e) => reject(new Error(/413|too large/i.test(String(e)) ? `Fichier trop lourd (limite : ${mb(LIMITS.uploadMaxBytes)}).` : "Envoi interrompu. Reprenez en rajoutant le même fichier.")),
        onProgress: (sent, total) => onProgress(total ? sent / total : 0),
        onSuccess: () => resolve(),
      });
      upload.findPreviousUploads().then((prev) => {
        if (prev.length) upload.resumeFromPreviousUpload(prev[0]);
        upload.start();
      });
    });
    return;
  }

  // Multipart S3 : parties de `partSize`, reprise depuis l'état local
  if (!api) throw new Error("Envoi multipart : API manquante.");
  const stateKey = `atlas-mp-${fingerprint ?? target.key}`;
  let done: { partNumber: number; etag: string }[] = [];
  try {
    const saved = JSON.parse(localStorage.getItem(stateKey) ?? "null") as { uploadId: string; parts: typeof done } | null;
    if (saved?.uploadId === target.uploadId) done = saved.parts;
  } catch {}
  const total = Math.ceil(blob.size / target.partSize);
  for (let n = 1; n <= total; n++) {
    if (done.some((p) => p.partNumber === n)) continue;
    const chunk = blob.slice((n - 1) * target.partSize, Math.min(n * target.partSize, blob.size));
    const etag = await withRetry(async () => {
      const signed = await api.presignPart(target.key, target.uploadId, n);
      if (!signed.ok) throw new Error(signed.error);
      const tag = await putXhr(signed.url, {}, chunk, (f) => onProgress(((n - 1) + f) / total));
      if (!tag) throw new Error("ETag manquant");
      return tag;
    });
    done.push({ partNumber: n, etag });
    try {
      localStorage.setItem(stateKey, JSON.stringify({ uploadId: target.uploadId, parts: done }));
    } catch {}
  }
  const res = await api.complete(target.key, target.uploadId, done.sort((a, b) => a.partNumber - b.partNumber));
  if (!res.ok) throw new Error(res.error ?? "Finalisation de l'envoi refusée.");
  try {
    localStorage.removeItem(stateKey);
  } catch {}
  onProgress(1);
}
