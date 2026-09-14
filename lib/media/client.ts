"use client";

import { ACCEPTED_IMAGE_MIMES, ACCEPTED_VIDEO_MIMES, LIMITS } from "@/lib/config";
import { describeVideoCodec, isH264, readSampleEntryTypes } from "./mp4";

export type PreparedFile = {
  blob: Blob;
  name: string;
  mime: string;
  kind: "image" | "video";
  width: number;
  height: number;
  duration?: number;
  poster?: Blob;
};

const mb = (n: number) => `${Math.round(n / 1024 / 1024)} Mo`;

function isHeic(file: File) {
  return file.type === "image/heic" || file.type === "image/heif" || /\.(heic|heif)$/i.test(file.name);
}

/**
 * Prépare un fichier avant upload : contrôle du type et de la taille, conversion
 * HEIC → JPEG, lecture des dimensions, contrôle H.264 et poster pour les vidéos.
 * Lève une Error avec un message en français en cas de refus.
 */
export async function prepareFile(file: File): Promise<PreparedFile> {
  const isVideo = (ACCEPTED_VIDEO_MIMES as readonly string[]).includes(file.type) || /\.(mp4|mov)$/i.test(file.name);
  const isImage = (ACCEPTED_IMAGE_MIMES as readonly string[]).includes(file.type) || isHeic(file);

  if (isVideo) return prepareVideo(file);
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
  return { blob, name: file.name.replace(/\.(heic|heif)$/i, ".jpg"), mime, kind: "image", width, height };
}

async function prepareVideo(file: File): Promise<PreparedFile> {
  if (file.size > LIMITS.videoMaxBytes) {
    throw new Error(`${file.name} dépasse ${mb(LIMITS.videoMaxBytes)}.`);
  }
  const buf = await file.arrayBuffer();
  const types = readSampleEntryTypes(buf);
  if (types.length === 0) {
    throw new Error(`${file.name} : fichier vidéo illisible.`);
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

function videoMetadata(file: File): Promise<{ width: number; height: number; duration: number; poster?: Blob }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;

    const fail = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Vidéo illisible par le navigateur."));
    };
    video.onerror = fail;

    video.onloadedmetadata = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      const duration = video.duration;
      // Poster : image à 0,5 s (ou au début si la vidéo est plus courte)
      video.currentTime = Math.min(0.5, Math.max(0, duration - 0.1));
      video.onseeked = () => {
        try {
          const canvas = document.createElement("canvas");
          const scale = Math.min(1, 1280 / Math.max(width, height));
          canvas.width = Math.round(width * scale);
          canvas.height = Math.round(height * scale);
          canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (poster) => {
              URL.revokeObjectURL(url);
              resolve({ width, height, duration, poster: poster ?? undefined });
            },
            "image/jpeg",
            0.85,
          );
        } catch {
          URL.revokeObjectURL(url);
          resolve({ width, height, duration });
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
                ? "Fichier trop lourd pour l'espace de stockage (limite actuelle : 50 Mo par fichier)."
                : `Envoi refusé par le stockage (${xhr.status}).`,
            ),
          );
    xhr.onerror = () => reject(new Error("Envoi interrompu. Vérifiez votre connexion."));
    xhr.send(blob);
  });
}
