import "server-only";

import type { VideoProvider } from "./provider";

/**
 * Bunny Stream — bascule documentée, non activée. Pour l'activer :
 *   VIDEO_PROVIDER=bunny
 *   BUNNY_LIBRARY_ID=…  BUNNY_API_KEY=…  BUNNY_CDN_HOST=vz-xxxx.b-cdn.net
 * Flux : création de la vidéo (POST /library/{id}/videos), envoi de l'original par
 * « fetch » depuis l'URL publique du stockage, puis lecture via
 * https://{CDN_HOST}/{videoId}/playlist.m3u8 et poster https://{CDN_HOST}/{videoId}/thumbnail.jpg.
 * Le champ media.hls_key reçoit l'URL absolue du playlist (mediaUrl la sert telle quelle).
 */
export const bunnyProvider: VideoProvider = {
  name: "bunny",
  async run() {
    if (!process.env.BUNNY_LIBRARY_ID || !process.env.BUNNY_API_KEY || !process.env.BUNNY_CDN_HOST) {
      return { status: "failed", remaining: 0, error: "Bunny Stream : variables BUNNY_* manquantes" };
    }
    return { status: "failed", remaining: 0, error: "Bunny Stream : intégration à activer (voir lib/video/bunny.ts)" };
  },
  async frameAt() {
    throw new Error("Bunny Stream : poster par timecode non disponible (utiliser une image)");
  },
  async extractAudio() {
    throw new Error("Bunny Stream : extraction audio non disponible");
  },
};
