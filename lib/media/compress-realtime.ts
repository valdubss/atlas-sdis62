"use client";

import { encodingPlan } from "./compress";

/**
 * Compression vidéo de secours, en temps réel : pour les appareils qui lisent la vidéo mais
 * n'ont pas d'encodeur audio WebCodecs (iPhone et iPad sous iOS 16.4 à 18). La vidéo est
 * rejouée en sourdine à vitesse normale, redessinée sur un canvas (1080p au plus) et
 * ré-enregistrée par MediaRecorder en MP4 H.264 + AAC, l'audio étant décodé à part et
 * rejoué en synchronisation. Dure autant que la vidéo ; l'application doit rester ouverte.
 * Jamais utilisée quand la compression WebCodecs complète est disponible.
 */
export type RealtimeResult = { blob: Blob; width: number; height: number; duration: number; poster?: Blob };

const AUDIO_KBPS = 96;

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  return audioCtx;
}

/**
 * À appeler depuis un geste de l'utilisateur (clic sur la zone d'envoi) : iOS n'autorise
 * le son Web Audio qu'après une interaction, et la compression démarre plus tard.
 */
export function unlockAudio() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
}

function mimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const m of ['video/mp4;codecs="avc1.640028,mp4a.40.2"', 'video/mp4;codecs="avc1,mp4a.40.2"', "video/mp4"]) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* type refusé */
    }
  }
  return null;
}

/** Vrai si l'appareil sait ré-enregistrer une vidéo en MP4 (Safari 14.5+ sur iPhone). */
export function canCompressRealtime(): boolean {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") return false;
  if (!("captureStream" in HTMLCanvasElement.prototype)) return false;
  return mimeType() !== null;
}

function loadVideo(file: File): Promise<{ video: HTMLVideoElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.setAttribute("aria-hidden", "true");
    video.style.cssText = "position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none";
    video.src = url;
    const timer = setTimeout(() => reject(new Error("La vidéo n'a pas pu être lue par l'appareil.")), 20_000);
    video.onerror = () => {
      clearTimeout(timer);
      reject(new Error("Vidéo illisible par l'appareil."));
    };
    video.onloadedmetadata = () => {
      clearTimeout(timer);
      if (!video.videoWidth || !video.videoHeight) reject(new Error("Vidéo sans image lisible."));
      else resolve({ video, url });
    };
    document.body.appendChild(video);
  });
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** Piste audio décodée, ou null si la vidéo n'en a pas (ou si l'appareil ne sait pas la lire). */
async function decodeAudio(file: File, ctx: AudioContext): Promise<AudioBuffer | null> {
  try {
    const bytes = await withTimeout(file.arrayBuffer(), 60_000, "Lecture du fichier trop longue.");
    return await withTimeout(ctx.decodeAudioData(bytes), 120_000, "Décodage du son trop long.");
  } catch (e) {
    if (e instanceof Error && /trop long/.test(e.message)) throw e;
    return null;
  }
}

export async function compressVideoRealtime(file: File, onProgress?: (fraction: number, label?: string) => void): Promise<RealtimeResult> {
  const mime = mimeType();
  if (!mime) throw new Error("Enregistrement MP4 indisponible sur cet appareil.");
  onProgress?.(0, "Lecture de la vidéo…");
  const { video, url } = await loadVideo(file);
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  if (!duration) throw new Error("Durée de la vidéo inconnue.");

  const { width, height, kbps } = encodingPlan(duration, video.videoWidth, video.videoHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx2d = canvas.getContext("2d", { alpha: false });
  if (!ctx2d) throw new Error("Canvas indisponible.");

  // Audio : décodé à part (la vidéo reste en sourdine, ce qui autorise la lecture sans geste)
  const actx = getAudioContext();
  onProgress?.(0, "Décodage du son…");
  const audioBuffer = actx ? await decodeAudio(file, actx) : null;
  const tracks: MediaStreamTrack[] = [];
  let audioSource: AudioBufferSourceNode | null = null;
  let dest: MediaStreamAudioDestinationNode | null = null;
  if (actx && audioBuffer) {
    // iOS : resume() hors d'un geste peut ne jamais répondre, on n'attend pas plus de 2 s
    if (actx.state !== "running") await withTimeout(actx.resume(), 2000, "son").catch(() => {});
    if (actx.state !== "running") {
      throw new Error("Le son n'a pas pu être activé par l'appareil : touchez l'écran, puis relancez l'envoi de la vidéo.");
    }
    dest = actx.createMediaStreamDestination();
    audioSource = actx.createBufferSource();
    audioSource.buffer = audioBuffer;
    audioSource.connect(dest);
    tracks.push(...dest.stream.getAudioTracks());
  }
  const canvasStream = canvas.captureStream(30);
  const stream = new MediaStream([...canvasStream.getVideoTracks(), ...tracks]);
  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: kbps * 1000,
    audioBitsPerSecond: AUDIO_KBPS * 1000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };

  // Vignette (poster) vers 0,4 s
  const posterCanvas = document.createElement("canvas");
  const posterScale = Math.min(1, 1280 / Math.max(width, height));
  posterCanvas.width = Math.round(width * posterScale);
  posterCanvas.height = Math.round(height * posterScale);
  const posterCtx = posterCanvas.getContext("2d", { alpha: false });
  let poster: Blob | undefined;
  let posterPending = false;

  let stopLoop = false;
  const draw = () => {
    if (stopLoop) return;
    ctx2d.drawImage(video, 0, 0, width, height);
    if (!poster && !posterPending && posterCtx && video.currentTime >= 0.4) {
      posterPending = true;
      posterCtx.drawImage(video, 0, 0, posterCanvas.width, posterCanvas.height);
      posterCanvas.toBlob((b) => (poster = b ?? undefined), "image/jpeg", 0.85);
    }
    onProgress?.(Math.min(0.99, video.currentTime / duration), `Compression ${Math.round((video.currentTime / duration) * 100)} % — gardez l'app ouverte`);
    const v = video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
    if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(draw);
    else requestAnimationFrame(draw);
  };

  const cleanup = () => {
    stopLoop = true;
    try {
      audioSource?.stop();
    } catch {
      /* déjà arrêté */
    }
    audioSource?.disconnect();
    dest?.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
    URL.revokeObjectURL(url);
  };

  try {
    await new Promise<void>((resolve, reject) => {
      const fail = (msg: string) => {
        if (recorder.state !== "inactive") {
          try {
            recorder.stop();
          } catch {
            /* ignoré */
          }
        }
        reject(new Error(msg));
      };
      const timer = setTimeout(() => fail("Compression trop longue : elle a été interrompue."), duration * 1500 + 20_000);
      recorder.onstop = () => {
        clearTimeout(timer);
        resolve();
      };
      recorder.onerror = () => fail("Enregistrement interrompu par l'appareil.");
      video.onended = () => {
        stopLoop = true;
        // Laisse MediaRecorder encoder les dernières images avant l'arrêt
        setTimeout(() => recorder.state !== "inactive" && recorder.stop(), 300);
      };
      video.onpause = () => {
        if (!video.ended && video.currentTime < duration - 0.5) fail("Compression interrompue : gardez l'application ouverte et l'écran allumé pendant la compression.");
      };
      video.onerror = () => fail("Vidéo illisible pendant la compression.");
      video.currentTime = 0;
      onProgress?.(0, "Compression 0 % — gardez l'app ouverte");
      // Première image avant le départ pour que l'enregistrement ne commence pas sur du noir
      const start = () => {
        ctx2d.drawImage(video, 0, 0, width, height);
        recorder.start(1000);
        audioSource?.start();
        video
          .play()
          .then(() => draw())
          .catch(() => fail("Lecture de la vidéo refusée par l'appareil."));
      };
      if (video.readyState >= 2) start();
      else video.onloadeddata = start;
    });
  } finally {
    cleanup();
  }

  if (!poster && posterCtx) {
    poster = await new Promise<Blob | undefined>((r) => posterCanvas.toBlob((b) => r(b ?? undefined), "image/jpeg", 0.85));
  }
  const blob = new Blob(chunks, { type: "video/mp4" });
  if (!blob.size) throw new Error("La compression n'a rien produit.");
  onProgress?.(1);
  return { blob, width, height, duration, poster };
}
