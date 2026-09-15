import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { getStorage } from "@/lib/storage";
import { mediaKeys } from "@/lib/media/keys";
import { probe, rmDir, runFfmpeg, tmpDir } from "./ffmpeg";
import type { TranscodeResult, VideoProvider } from "./provider";

/** Rendus cibles (hauteur → débit vidéo). Jamais au-dessus de la source. */
const LADDER: { height: number; bitrateK: number; audioK: number }[] = [
  { height: 1080, bitrateK: 2600, audioK: 96 },
  { height: 720, bitrateK: 1500, audioK: 64 },
  { height: 360, bitrateK: 600, audioK: 64 },
];
const SEGMENT_S = 4;

type Rendition = { height: number; bandwidth: number; key: string; width?: number };

function admin() {
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

function masterPlaylist(renditions: Rendition[]) {
  const lines = ["#EXTM3U", "#EXT-X-VERSION:7"];
  for (const r of [...renditions].sort((a, b) => b.height - a.height)) {
    const res = r.width ? `,RESOLUTION=${r.width}x${r.height}` : "";
    lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${r.bandwidth}${res},CODECS="avc1.640028,mp4a.40.2"`, `v${r.height}/index.m3u8`);
  }
  return lines.join("\n") + "\n";
}

/** Envoie un dossier HLS (playlist + segments) dans le stockage ; renvoie les clés. */
async function uploadDir(dir: string, prefix: string): Promise<string[]> {
  const storage = getStorage();
  const files = await fs.readdir(dir);
  const keys: string[] = [];
  for (let i = 0; i < files.length; i += 8) {
    await Promise.all(
      files.slice(i, i + 8).map(async (f) => {
        const key = `${prefix}/${f}`;
        const body = await fs.readFile(path.join(dir, f));
        const mime = f.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : f.endsWith(".mp4") ? "video/mp4" : "video/iso.segment";
        await storage.putObject(key, body, mime);
        keys.push(key);
      }),
    );
  }
  return keys;
}

async function encodeRendition(src: string, outDir: string, r: { height: number; bitrateK: number; audioK: number }, copy: boolean) {
  await fs.mkdir(outDir, { recursive: true });
  const args = ["-i", src];
  if (copy) args.push("-c:v", "copy", "-c:a", "copy");
  else
    args.push(
      "-vf", `scale=-2:${r.height}`,
      "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "high", "-level", "4.0",
      "-b:v", `${r.bitrateK}k`, "-maxrate", `${Math.round(r.bitrateK * 1.2)}k`, "-bufsize", `${r.bitrateK * 2}k`,
      "-g", String(SEGMENT_S * 30), "-keyint_min", String(SEGMENT_S * 30), "-sc_threshold", "0",
      "-c:a", "aac", "-b:a", `${r.audioK}k`, "-ac", "2",
    );
  // Exécuté dans le dossier de sortie : ffmpeg écrit le segment d'initialisation relativement au répertoire courant
  args.push(
    "-movflags", "+faststart",
    "-f", "hls", "-hls_time", String(SEGMENT_S), "-hls_playlist_type", "vod",
    "-hls_segment_type", "fmp4", "-hls_fmp4_init_filename", "init.mp4",
    "-hls_segment_filename", "seg_%04d.m4s",
    "-hls_flags", "independent_segments",
    "index.m3u8",
  );
  await runFfmpeg(args, { cwd: outDir });
}

/** Poster JPEG à `timeS` (bornée à la durée). */
async function extractFrame(src: string, timeS: number, out: string, height = 1080) {
  await runFfmpeg(["-ss", String(Math.max(0, timeS)), "-i", src, "-frames:v", "1", "-vf", `scale=-2:'min(${height},ih)'`, "-q:v", "3", out], { timeoutMs: 60_000 });
}

/**
 * Transcodage par étapes, chacune dans le budget : (1) analyse, poster, rendu
 * « source » remuxé en HLS (lisible aussitôt) ; (2) puis chaque rendu inférieur.
 */
async function run(mediaId: string, budgetMs: number): Promise<TranscodeResult> {
  const started = Date.now();
  const left = () => budgetMs - (Date.now() - started);
  const db = admin();
  const { data: row } = await db.from("media").select("*").eq("id", mediaId).maybeSingle();
  if (!row || row.kind !== "video") return { status: "failed", remaining: 0, error: "média vidéo introuvable" };
  if (row.video_status === "ready" && pendingRenditions(row).length === 0) return { status: "ready", remaining: 0 };

  await db.from("media").update({ video_status: "processing", transcode_started_at: new Date().toISOString(), transcode_attempts: (row.transcode_attempts ?? 0) + 1, video_error: null }).eq("id", mediaId);
  const dir = await tmpDir();
  try {
    const storage = getStorage();
    const src = path.join(dir, "source.mp4");
    await fs.writeFile(src, await storage.getObject(row.original_key));
    const info = await probe(src);
    const width = row.width ?? info.width;
    const height = row.height ?? info.height;
    const duration = row.duration_s ?? info.duration;
    const orientation = width > height ? "landscape" : width < height ? "portrait" : "square";
    const prefix = mediaKeys.hls(mediaId);
    let renditions: Rendition[] = (row.renditions as Rendition[]) ?? [];
    let files: string[] = row.hls_files ?? [];

    // Étape 1 : poster + rendu source (copie, quelques secondes)
    if (renditions.length === 0) {
      if (row.poster_source !== "upload" || !row.poster_key) {
        const posterPath = path.join(dir, "poster.jpg");
        const t = row.poster_source === "timecode" && row.poster_time_s != null ? Number(row.poster_time_s) : Math.min(1, Math.max(0, duration - 0.1));
        await extractFrame(src, t, posterPath);
        await storage.putObject(mediaKeys.poster(mediaId), await fs.readFile(posterPath), "image/jpeg");
      }
      const srcHeight = Math.min(height, 1080);
      const top = LADDER.find((l) => l.height <= srcHeight) ?? LADDER[LADDER.length - 1];
      const outDir = path.join(dir, `v${top.height}`);
      // Copie directe si la source est déjà H.264 ≤ 1080p (cas des vidéos compressées sur l'appareil)
      await encodeRendition(src, outDir, top, height <= 1080);
      const keys = await uploadDir(outDir, `${prefix}/v${top.height}`);
      renditions = [{ height: top.height, width: Math.round((width / height) * top.height / 2) * 2, bandwidth: top.bitrateK * 1000 + top.audioK * 1000, key: `${prefix}/v${top.height}/index.m3u8` }];
      files = [...files, ...keys];
      const masterKey = `${prefix}/master.m3u8`;
      await storage.putObject(masterKey, Buffer.from(masterPlaylist(renditions)), "application/vnd.apple.mpegurl");
      files.push(masterKey);
      await db
        .from("media")
        .update({
          video_status: "ready",
          hls_key: masterKey,
          renditions,
          hls_files: files,
          orientation,
          width,
          height,
          duration_s: duration || null,
          poster_key: row.poster_source === "upload" && row.poster_key ? row.poster_key : mediaKeys.poster(mediaId),
        })
        .eq("id", mediaId);
    }

    // Étape 2 : rendus inférieurs, un par passage si le budget le permet
    for (const r of pendingRenditions({ ...row, renditions, height })) {
      // Estimation grossière : veryfast ≈ 3× temps réel pour 720p sur 1 vCPU
      const estimateMs = duration * 1000 * (r.height >= 720 ? 3 : 1.5) + 15_000;
      if (left() < estimateMs) return { status: "ready", remaining: pendingRenditions({ ...row, renditions, height }).length };
      const outDir = path.join(dir, `v${r.height}`);
      await encodeRendition(src, outDir, r, false);
      const keys = await uploadDir(outDir, `${prefix}/v${r.height}`);
      renditions = [...renditions, { height: r.height, width: Math.round((width / height) * r.height / 2) * 2, bandwidth: r.bitrateK * 1000 + r.audioK * 1000, key: `${prefix}/v${r.height}/index.m3u8` }];
      files = [...files, ...keys];
      await storage.putObject(`${prefix}/master.m3u8`, Buffer.from(masterPlaylist(renditions)), "application/vnd.apple.mpegurl");
      await db.from("media").update({ renditions, hls_files: files, video_status: "ready" }).eq("id", mediaId);
      await rmDir(outDir);
    }
    return { status: "ready", remaining: 0 };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.from("media").update({ video_status: "failed", video_error: message.slice(0, 500) }).eq("id", mediaId);
    return { status: "failed", remaining: 0, error: message };
  } finally {
    await rmDir(dir);
  }
}

/** Rendus encore à produire pour une ligne média (selon la hauteur de la source). */
export function pendingRenditions(row: { renditions: unknown; height: number | null }): { height: number; bitrateK: number; audioK: number }[] {
  const done = new Set(((row.renditions as Rendition[]) ?? []).map((r) => r.height));
  const srcHeight = Math.min(row.height ?? 1080, 1080);
  if (done.size === 0) return LADDER.filter((l) => l.height <= srcHeight);
  return LADDER.filter((l) => l.height < srcHeight && !done.has(l.height) && l.height < Math.max(...done));
}

async function withSource<T>(mediaId: string, fn: (src: string, dir: string) => Promise<T>): Promise<T> {
  const db = admin();
  const { data: row } = await db.from("media").select("original_key, kind").eq("id", mediaId).maybeSingle();
  if (!row || row.kind !== "video") throw new Error("média vidéo introuvable");
  const dir = await tmpDir();
  try {
    const src = path.join(dir, "source.mp4");
    await fs.writeFile(src, await getStorage().getObject(row.original_key));
    return await fn(src, dir);
  } finally {
    await rmDir(dir);
  }
}

export const ffmpegProvider: VideoProvider = {
  name: "ffmpeg",
  run,
  frameAt: (mediaId, timeS) =>
    withSource(mediaId, async (src, dir) => {
      const out = path.join(dir, "frame.jpg");
      await extractFrame(src, timeS, out);
      return fs.readFile(out);
    }),
  extractAudio: (mediaId) =>
    withSource(mediaId, async (src, dir) => {
      const out = path.join(dir, "audio.wav");
      await runFfmpeg(["-i", src, "-vn", "-ac", "1", "-ar", "16000", "-f", "wav", out], { timeoutMs: 120_000 });
      return fs.readFile(out);
    }),
};
