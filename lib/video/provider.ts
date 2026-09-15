import "server-only";

/**
 * Contrat du transcodage vidéo. Deux fournisseurs :
 *  - "ffmpeg" (défaut) : route Vercel `/api/video/transcode`, ffmpeg embarqué,
 *    HLS fMP4 en 360p / 720p / 1080p écrit dans le stockage de l'application ;
 *  - "bunny" : Bunny Stream (VIDEO_PROVIDER=bunny + BUNNY_LIBRARY_ID, BUNNY_API_KEY,
 *    BUNNY_CDN_HOST). Même contrat ; l'application ne change pas.
 *
 * `run` fait « autant que possible » dans le budget de temps donné et rend
 * `remaining` > 0 s'il reste des rendus à produire : l'appelant (client ou cron)
 * relance jusqu'à `remaining = 0`.
 */
export type TranscodeResult = { status: "processing" | "ready" | "failed"; remaining: number; error?: string };

export interface VideoProvider {
  readonly name: "ffmpeg" | "bunny";
  run(mediaId: string, budgetMs: number): Promise<TranscodeResult>;
  /** Image fixe à un instant donné (JPEG), pour le poster « timecode ». */
  frameAt(mediaId: string, timeS: number): Promise<Buffer>;
  /** Piste audio mono 16 kHz (WAV) pour la transcription. */
  extractAudio(mediaId: string): Promise<Buffer>;
}

export async function getVideoProvider(): Promise<VideoProvider> {
  if (process.env.VIDEO_PROVIDER === "bunny") {
    const { bunnyProvider } = await import("./bunny");
    return bunnyProvider;
  }
  const { ffmpegProvider } = await import("./transcode");
  return ffmpegProvider;
}
