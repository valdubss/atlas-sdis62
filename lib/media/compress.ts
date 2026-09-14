"use client";

import { ArrayBufferTarget, Muxer } from "mp4-muxer";

/**
 * Compression vidéo sur l'appareil, façon Instagram : la vidéo est relue par
 * le navigateur (tout format qu'il sait lire, HEVC d'iPhone compris), chaque
 * image est ré-encodée en H.264 (1080p max, 30 i/s) et l'audio en AAC, puis le
 * tout est remis en MP4 « fast start ». Aucun serveur, aucune dépendance native.
 *
 * Nécessite WebCodecs (VideoEncoder + AudioEncoder) : Safari 17.4+, Chrome 94+.
 */
export type CompressResult = { blob: Blob; width: number; height: number; duration: number; poster?: Blob };

const MAX_LONG_SIDE = 1920;
const MAX_SHORT_SIDE = 1080;
const TARGET_FPS = 30;
// Débits façon Instagram : lisibles en 4G dès la première seconde
const VIDEO_KBPS_1080 = 2600;
const VIDEO_KBPS_720 = 1600;
const AUDIO_KBPS = 64;
const KEYFRAME_INTERVAL_S = 2;

let supportCache: Promise<boolean> | null = null;

/** Vrai si l'appareil sait ré-encoder en H.264 + AAC. */
export function canCompressVideo(): Promise<boolean> {
  if (supportCache) return supportCache;
  supportCache = (async () => {
    if (typeof window === "undefined") return false;
    if (!("VideoEncoder" in window) || !("AudioEncoder" in window) || !("VideoFrame" in window)) return false;
    if (!("requestVideoFrameCallback" in HTMLVideoElement.prototype)) return false;
    try {
      const v = await VideoEncoder.isConfigSupported({ codec: "avc1.640028", width: 1920, height: 1080, bitrate: 4_000_000, framerate: 30 });
      const a = await AudioEncoder.isConfigSupported({ codec: "mp4a.40.2", sampleRate: 48000, numberOfChannels: 2, bitrate: 96_000 });
      return Boolean(v.supported && a.supported);
    } catch {
      return false;
    }
  })();
  return supportCache;
}

function targetSize(w: number, h: number) {
  const long = Math.max(w, h);
  const short = Math.min(w, h);
  const scale = Math.min(1, MAX_LONG_SIDE / long, MAX_SHORT_SIDE / short);
  // Dimensions paires (exigées par H.264)
  const tw = Math.round((w * scale) / 2) * 2;
  const th = Math.round((h * scale) / 2) * 2;
  return { width: tw, height: th };
}

function loadVideo(file: File): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    const timer = setTimeout(() => reject(new Error("La vidéo n'a pas pu être lue par l'appareil.")), 20_000);
    video.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Vidéo illisible par l'appareil."));
    };
    video.onloadedmetadata = () => {
      clearTimeout(timer);
      if (!video.videoWidth || !video.videoHeight) reject(new Error("Vidéo sans image lisible."));
      else resolve(video);
    };
  });
}

/** Piste audio décodée (PCM), ou null si la vidéo n'en a pas. */
async function decodeAudio(file: File): Promise<AudioBuffer | null> {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    try {
      return await ctx.decodeAudioData(await file.arrayBuffer());
    } finally {
      ctx.close().catch(() => {});
    }
  } catch {
    return null;
  }
}

export async function compressVideo(file: File, onProgress?: (fraction: number) => void): Promise<CompressResult> {
  const video = await loadVideo(file);
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  if (!duration) throw new Error("Durée de la vidéo inconnue.");

  const { width, height } = targetSize(video.videoWidth, video.videoHeight);
  const is1080 = Math.max(width, height) > 1300;
  const audio = await decodeAudio(file);

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width, height },
    audio: audio ? { codec: "aac", sampleRate: audio.sampleRate, numberOfChannels: Math.min(2, audio.numberOfChannels) } : undefined,
    fastStart: "in-memory",
    firstTimestampBehavior: "offset",
  });

  let encodeError: Error | null = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encodeError = e instanceof Error ? e : new Error(String(e));
    },
  });
  videoEncoder.configure({
    codec: "avc1.640028",
    width,
    height,
    bitrate: (is1080 ? VIDEO_KBPS_1080 : VIDEO_KBPS_720) * 1000,
    framerate: TARGET_FPS,
    latencyMode: "quality",
    avc: { format: "avc" },
  });

  // --- Audio : PCM → AAC (en parallèle de la vidéo)
  const audioDone = (async () => {
    if (!audio) return;
    const channels = Math.min(2, audio.numberOfChannels);
    const encoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => {
        encodeError = e instanceof Error ? e : new Error(String(e));
      },
    });
    encoder.configure({ codec: "mp4a.40.2", sampleRate: audio.sampleRate, numberOfChannels: channels, bitrate: AUDIO_KBPS * 1000 });
    const FRAMES = 1024;
    const total = audio.length;
    for (let offset = 0; offset < total; offset += FRAMES) {
      const count = Math.min(FRAMES, total - offset);
      const data = new Float32Array(count * channels);
      for (let c = 0; c < channels; c++) data.set(audio.getChannelData(c).subarray(offset, offset + count), c * count);
      const frame = new AudioData({ format: "f32-planar", sampleRate: audio.sampleRate, numberOfFrames: count, numberOfChannels: channels, timestamp: Math.round((offset / audio.sampleRate) * 1e6), data });
      encoder.encode(frame);
      frame.close();
      // Laisser respirer l'interface et l'encodeur
      if (encoder.encodeQueueSize > 16) await new Promise((r) => setTimeout(r, 8));
    }
    await encoder.flush();
    encoder.close();
  })();

  // --- Vidéo : lecture muette + capture de chaque image présentée
  const scale = width !== video.videoWidth || height !== video.videoHeight;
  const canvas = scale ? document.createElement("canvas") : null;
  if (canvas) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas?.getContext("2d", { alpha: false }) ?? null;
  // Vignette (poster) : toujours produite, même sans redimensionnement
  const posterCanvas = document.createElement("canvas");
  const posterScale = Math.min(1, 1280 / Math.max(width, height));
  posterCanvas.width = Math.round(width * posterScale);
  posterCanvas.height = Math.round(height * posterScale);
  const posterCtx = posterCanvas.getContext("2d", { alpha: false });

  let poster: Blob | undefined;
  let posterPending = false;
  let lastTs = -1;
  let frames = 0;
  const minDelta = 1 / TARGET_FPS - 0.004;

  await new Promise<void>((resolve, reject) => {
    let finished = false;
    const finish = (err?: Error) => {
      if (finished) return;
      finished = true;
      video.pause();
      if (err) reject(err);
      else resolve();
    };
    const onFrame = (_now: number, meta: VideoFrameCallbackMetadata) => {
      if (finished) return;
      if (encodeError) return finish(encodeError);
      const t = meta.mediaTime;
      if (t - lastTs >= minDelta || lastTs < 0) {
        try {
          let frame: VideoFrame;
          if (ctx && canvas) {
            ctx.drawImage(video, 0, 0, width, height);
            frame = new VideoFrame(canvas, { timestamp: Math.round(t * 1e6) });
          } else {
            frame = new VideoFrame(video, { timestamp: Math.round(t * 1e6) });
          }
          videoEncoder.encode(frame, { keyFrame: frames % Math.round(TARGET_FPS * KEYFRAME_INTERVAL_S) === 0 });
          frame.close();
          frames++;
          lastTs = t;
          if (!poster && !posterPending && t >= 0.4 && posterCtx) {
            posterPending = true;
            posterCtx.drawImage(video, 0, 0, posterCanvas.width, posterCanvas.height);
            posterCanvas.toBlob((b) => (poster = b ?? undefined), "image/jpeg", 0.85);
          }
        } catch (e) {
          return finish(e instanceof Error ? e : new Error(String(e)));
        }
      }
      onProgress?.(Math.min(0.98, t / duration));
      // Contre-pression : si l'encodeur prend du retard, la lecture attend
      if (videoEncoder.encodeQueueSize > 12 && !video.paused) {
        video.pause();
        const resume = () => {
          videoEncoder.removeEventListener("dequeue", resume);
          if (!finished) video.play().catch(() => {});
        };
        videoEncoder.addEventListener("dequeue", resume);
      }
      video.requestVideoFrameCallback(onFrame);
    };
    video.onended = () => finish();
    video.onerror = () => finish(new Error("Lecture interrompue pendant la compression."));
    video.requestVideoFrameCallback(onFrame);
    video.currentTime = 0;
    video.play().catch((e) => finish(new Error("Lecture impossible pendant la compression : " + (e as Error).message)));
  });

  await videoEncoder.flush();
  videoEncoder.close();
  await audioDone;
  if (encodeError) throw encodeError;
  if (frames === 0) throw new Error("Aucune image encodée.");

  muxer.finalize();
  const { buffer } = muxer.target;
  URL.revokeObjectURL(video.src);
  video.removeAttribute("src");
  video.load();

  // Poster de secours (vidéo très courte) : dernière image dessinée
  if (!poster && posterCtx) {
    poster = await new Promise<Blob | undefined>((r) => posterCanvas.toBlob((b) => r(b ?? undefined), "image/jpeg", 0.85));
  }
  onProgress?.(1);
  return { blob: new Blob([buffer], { type: "video/mp4" }), width, height, duration, poster };
}
