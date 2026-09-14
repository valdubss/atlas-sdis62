"use client";

import { ACCEPTED_IMAGE_MIMES, ACCEPTED_VIDEO_MIMES, LIMITS } from "@/lib/config";
import { describeVideoCodec, isH264, readSampleEntryTypes } from "./mp4";
import { canCompressVideo, compressVideo } from "./compress";

export type PreparedFile = {
  blob: Blob;
  name: string;
  mime: string;
  kind: "image" | "video";
  width: number;
  height: number;
  duration?: number;
  poster?: Blob;
  /** Taille du fichier d'origine si la vidéo a été compressée sur l'appareil */
  originalBytes?: number;
};

export type PrepareOptions = {
  /** Progression (0–1) et libellé d'étape, pour l'interface */
  onProgress?: (fraction: number, label: string) => void;
  /** Durée maximale acceptée (s) : vérifiée avant toute compression */
  maxDurationS?: number;
};

/** Fichier source le plus lourd accepté pour une compression sur l'appareil. */
const SOURCE_MAX_BYTES = 400 * 1024 * 1024;

const mb = (n: number) => `${Math.round(n / 1024 / 1024)} Mo`;

function isHeic(file: File) {
  return file.type === "image/heic" || file.type === "image/heif" || /\.(heic|heif)$/i.test(file.name);
}

/**
 * Prépare un fichier avant upload : contrôle du type et de la taille, conversion
 * HEIC → JPEG, lecture des dimensions, contrôle H.264 et poster pour les vidéos.
 * Lève une Error avec un message en français en cas de refus.
 */
export async function prepareFile(file: File, options: PrepareOptions = {}): Promise<PreparedFile> {
  const isVideo = (ACCEPTED_VIDEO_MIMES as readonly string[]).includes(file.type) || file.type.startsWith("video/") || /\.(mp4|mov|m4v|webm|3gp)$/i.test(file.name);
  const isImage = (ACCEPTED_IMAGE_MIMES as readonly string[]).includes(file.type) || isHeic(file);

  if (isVideo) return prepareVideo(file, options);
  if (isImage) return prepareImage(file);
  throw new Error(`Format non pris en charge : ${file.name}. Formats acceptés : jpg, png, webp, heic, mp4, mov.`);
}

async function prepareImage(file: File): Promise<PreparedFile> {
  if (file.size > LIMITS.imageMaxBytes) {
    throw new Error(`${file.name} dépasse ${mb(LIMITS.imageMaxBytes)}.`);
  }
  let blob: Blob = file;
  let mime = file.type;
  if (isHeic(file)) {
    const heic2any = (await import("heic2any")).default;
    const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    blob = Array.isArray(converted) ? converted[0] : converted;
    mime = "image/jpeg";
  }
  const { width, height } = await imageDimensions(blob);
  // Réduction sur l'appareil (façon Instagram) : 2400 px de côté au plus, JPEG
  // 86 % — l'envoi est 3 à 6 fois plus léger et le serveur a moins à faire.
  const shrunk = await shrinkImage(blob, width, height, mime);
  if (shrunk) return { blob: shrunk.blob, name: file.name.replace(/\.[^.]+$/, "") + ".jpg", mime: "image/jpeg", kind: "image", width: shrunk.width, height: shrunk.height, originalBytes: file.size };
  return { blob, name: file.name.replace(/\.(heic|heif)$/i, ".jpg"), mime, kind: "image", width, height };
}

const IMAGE_MAX_SIDE = 2400;

/** Redimensionne et recompresse une image si elle est grande ou lourde ; null si inutile ou impossible. */
async function shrinkImage(blob: Blob, width: number, height: number, mime: string): Promise<{ blob: Blob; width: number; height: number } | null> {
  const tooBig = Math.max(width, height) > IMAGE_MAX_SIDE;
  const heavy = blob.size > 1.5 * 1024 * 1024 && mime !== "image/png";
  if (!tooBig && !heavy) return null;
  try {
    const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(width, height));
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" } as ImageBitmapOptions);
    const canvas = document.createElement("canvas");
    // L'orientation EXIF est appliquée par createImageBitmap : les dimensions peuvent être inversées
    const rotated = (bitmap.width > bitmap.height) !== (width > height);
    canvas.width = rotated ? h : w;
    canvas.height = rotated ? w : h;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.86));
    if (!out || out.size >= blob.size) return null;
    return { blob: out, width: canvas.width, height: canvas.height };
  } catch {
    return null;
  }
}

async function prepareVideo(file: File, options: PrepareOptions): Promise<PreparedFile> {
  // Compression sur l'appareil (façon Instagram) quand le navigateur le permet :
  // n'importe quel format lisible (HEVC d'iPhone compris) ressort en MP4 H.264
  // 1080p, léger et lisible partout. Sinon, chemin historique : H.264 exigé.
  if (file.size <= SOURCE_MAX_BYTES && (await canCompressVideo())) {
    options.onProgress?.(0, "Analyse de la vidéo…");
    if (options.maxDurationS) {
      const d = await quickDuration(file);
      if (d && d > options.maxDurationS + 0.5) {
        throw new Error(`Cette vidéo dure ${Math.round(d)} s : ${options.maxDurationS} s au plus ici.`);
      }
    }
    try {
      const out = await compressVideo(file, (f) => options.onProgress?.(f, `Compression ${Math.round(f * 100)} %`));
      if (out.blob.size > LIMITS.videoMaxBytes) {
        throw new Error(`Même compressée, la vidéo dépasse ${mb(LIMITS.videoMaxBytes)} : raccourcissez-la.`);
      }
      return {
        blob: out.blob,
        name: file.name.replace(/\.[^.]+$/, "") + ".mp4",
        mime: "video/mp4",
        kind: "video",
        width: out.width,
        height: out.height,
        duration: out.duration,
        poster: out.poster,
        originalBytes: file.size,
      };
    } catch (e) {
      // Compression impossible sur cet appareil : on retombe sur l'envoi direct si le fichier s'y prête
      if (e instanceof Error && /dépasse|raccourcissez|au plus ici/.test(e.message)) throw e;
      console.warn("compression vidéo impossible, envoi direct", e);
    }
  }

  if (file.size > LIMITS.videoMaxBytes) {
    throw new Error(`${file.name} dépasse ${mb(LIMITS.videoMaxBytes)}. Sur ce navigateur, la vidéo ne peut pas être compressée : réduisez-la avant l'envoi.`);
  }
  // Les atomes MP4 utiles (moov/stsd) sont en tête ou en queue : on ne lit
  // jamais tout le fichier en mémoire sur le téléphone.
  const WINDOW = 8 * 1024 * 1024;
  let types = readSampleEntryTypes(await file.slice(0, WINDOW).arrayBuffer());
  if (types.length === 0 && file.size > WINDOW) {
    types = readSampleEntryTypes(await file.slice(file.size - WINDOW).arrayBuffer());
  }
  if (types.length === 0 && file.size > WINDOW) {
    // Dernier recours : le fichier entier (au plus la limite d'envoi)
    types = readSampleEntryTypes(await file.arrayBuffer());
  }
  if (types.length === 0) {
    throw new Error(`${file.name} : fichier vidéo illisible (conteneur MP4/MOV attendu).`);
  }
  if (!isH264(types)) {
    throw new Error(
      `${file.name} est encodée en ${describeVideoCodec(types)}. Seul le H.264 est accepté : réexportez la vidéo en MP4 H.264 (sur iPhone : Réglages → Appareil photo → Formats → « Le plus compatible »).`,
    );
  }
  const meta = await videoMetadata(file);
  return {
    blob: file,
    name: file.name.replace(/\.mov$/i, ".mp4"),
    mime: "video/mp4",
    kind: "video",
    width: meta.width,
    height: meta.height,
    duration: meta.duration,
    poster: meta.poster,
  };
}

function imageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image illisible."));
    };
    img.src = url;
  });
}

/** Durée d'une vidéo via ses métadonnées seules (rapide), 0 si inconnue. */
function quickDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    const done = (d: number) => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      resolve(Number.isFinite(d) ? d : 0);
    };
    const timer = setTimeout(() => done(0), 8000);
    video.onloadedmetadata = () => {
      clearTimeout(timer);
      done(video.duration);
    };
    video.onerror = () => {
      clearTimeout(timer);
      done(0);
    };
    video.src = url;
  });
}

function videoMetadata(file: File): Promise<{ width: number; height: number; duration: number; poster?: Blob }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    let settled = false;
    const done = (value: { width: number; height: number; duration: number; poster?: Blob } | null, error?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(metaTimer);
      clearTimeout(posterTimer);
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
      if (value) resolve(value);
      else reject(new Error(error ?? "Vidéo illisible par le navigateur."));
    };
    // Délais de garde : jamais bloqué sur « Préparation » (iOS peut ne jamais
    // émettre seeked sur un blob ; le poster est alors simplement omis).
    let posterTimer: ReturnType<typeof setTimeout> | undefined;
    const metaTimer = setTimeout(() => done(null, "La vidéo n'a pas pu être lue par le téléphone (délai dépassé). Réessayez avec un export MP4 H.264."), 20_000);

    video.onerror = () => done(null);

    video.onloadedmetadata = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      const duration = video.duration;
      if (!width || !height) {
        done(null, "Vidéo sans piste image lisible.");
        return;
      }
      posterTimer = setTimeout(() => done({ width, height, duration }), 6_000);
      // Poster : image à 0,5 s (ou au début si la vidéo est plus courte)
      try {
        video.currentTime = Math.min(0.5, Math.max(0, (Number.isFinite(duration) ? duration : 1) - 0.1));
      } catch {
        done({ width, height, duration });
        return;
      }
      video.onseeked = () => {
        try {
          const canvas = document.createElement("canvas");
          const scale = Math.min(1, 1280 / Math.max(width, height));
          canvas.width = Math.round(width * scale);
          canvas.height = Math.round(height * scale);
          canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (poster) => done({ width, height, duration, poster: poster ?? undefined }),
            "image/jpeg",
            0.85,
          );
        } catch {
          done({ width, height, duration });
        }
      };
    };
  });
}

/** PUT direct vers l'URL signée avec suivi de progression (XHR). */
export function uploadWithProgress(
  url: string,
  headers: Record<string, string>,
  blob: Blob,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(
            new Error(
              xhr.status === 413
                ? `Fichier trop lourd pour l'espace de stockage (limite : ${mb(LIMITS.uploadMaxBytes)} par fichier).`
                : `Envoi refusé par le stockage (${xhr.status}).`,
            ),
          );
    xhr.onerror = () => reject(new Error("Envoi interrompu. Vérifiez votre connexion."));
    xhr.send(blob);
  });
}
