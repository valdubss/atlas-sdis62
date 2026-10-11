import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import type { VideoProvider } from "./provider";
import { bunnyGuidOf, bunnySyncMedia, bunnyUrls } from "./bunny-api";

/**
 * Bunny Stream — fournisseur vidéo (VIDEO_PROVIDER=bunny) : l'encodage est fait chez Bunny,
 * `run` se contente de relire l'état et de mettre la ligne média à jour (bunny-api.ts).
 * Poster « timecode » et piste audio (transcription) sont extraits par ffmpeg depuis le
 * flux HLS du CDN : ce module n'est chargé que par les routes /api/video/*.
 */
async function hlsSource(mediaId: string): Promise<string> {
  const db = createAdminClient();
  const { data: row } = await db.from("media").select("original_key, hls_key, kind").eq("id", mediaId).maybeSingle();
  if (!row || row.kind !== "video") throw new Error("média vidéo introuvable");
  const guid = bunnyGuidOf(row);
  if (!guid) throw new Error("vidéo hors Bunny Stream");
  return bunnyUrls(guid).hls;
}

export const bunnyProvider: VideoProvider = {
  name: "bunny",
  run: (mediaId) => bunnySyncMedia(mediaId),
  frameAt: async (mediaId, timeS) => {
    const { runFfmpeg, tmpDir, rmDir } = await import("./ffmpeg");
    const src = await hlsSource(mediaId);
    const dir = await tmpDir();
    try {
      const out = path.join(dir, "frame.jpg");
      await runFfmpeg(["-ss", String(Math.max(0, timeS)), "-i", src, "-frames:v", "1", "-vf", "scale=-2:'min(1080,ih)'", "-q:v", "3", out], { timeoutMs: 90_000 });
      return await fs.readFile(out);
    } finally {
      await rmDir(dir);
    }
  },
  extractAudio: async (mediaId) => {
    const { runFfmpeg, tmpDir, rmDir } = await import("./ffmpeg");
    const src = await hlsSource(mediaId);
    const dir = await tmpDir();
    try {
      const out = path.join(dir, "audio.wav");
      await runFfmpeg(["-i", src, "-vn", "-ac", "1", "-ar", "16000", "-f", "wav", out], { timeoutMs: 180_000 });
      return await fs.readFile(out);
    } finally {
      await rmDir(dir);
    }
  },
};
