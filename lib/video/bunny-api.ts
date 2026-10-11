import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/database.types";
import type { TranscodeResult } from "./provider";

/**
 * Bunny Stream, côté API (sans ffmpeg, importable par les actions et les routes légères) :
 * création de la vidéo, signature de l'envoi TUS direct depuis le navigateur, lecture de
 * l'état d'encodage et mise à jour de la ligne `media`, suppression.
 *
 * Variables : VIDEO_PROVIDER=bunny, BUNNY_LIBRARY_ID, BUNNY_API_KEY, BUNNY_CDN_HOST.
 * Clés stockées dans `media` : `original_key` = MP4 de repli sur le CDN
 * (https://{cdn}/{guid}/play_720p.mp4, « MP4 Fallback » activé dans la bibliothèque),
 * `hls_key` = https://{cdn}/{guid}/playlist.m3u8, `poster_key` = vignette Bunny si aucun
 * poster propre. `mediaUrl` sert ces URL absolues telles quelles.
 */
const API = "https://video.bunnycdn.com";

export type BunnyConfig = { libraryId: string; apiKey: string; cdnHost: string };

export function bunnyConfig(): BunnyConfig | null {
  const libraryId = process.env.BUNNY_LIBRARY_ID;
  const apiKey = process.env.BUNNY_API_KEY;
  const cdnHost = process.env.BUNNY_CDN_HOST;
  if (!libraryId || !apiKey || !cdnHost) return null;
  return { libraryId, apiKey, cdnHost: cdnHost.replace(/^https?:\/\//, "").replace(/\/$/, "") };
}

/** Vrai quand les vidéos partent directement chez Bunny Stream (envoi + encodage + diffusion). */
export function bunnyEnabled(): boolean {
  return process.env.VIDEO_PROVIDER === "bunny" && bunnyConfig() !== null;
}

function cfg(): BunnyConfig {
  const c = bunnyConfig();
  if (!c) throw new Error("Bunny Stream : variables BUNNY_* manquantes");
  return c;
}

async function call<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { apiKey } = cfg();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { AccessKey: apiKey, accept: "application/json", ...(init.json !== undefined ? { "content-type": "application/json" } : {}), ...(init.headers ?? {}) },
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Bunny Stream ${res.status} : ${text.slice(0, 200) || res.statusText}`);
  }
  return (await res.json().catch(() => ({}))) as T;
}

export function bunnyUrls(guid: string) {
  const { cdnHost } = cfg();
  return {
    hls: `https://${cdnHost}/${guid}/playlist.m3u8`,
    mp4: `https://${cdnHost}/${guid}/play_720p.mp4`,
    thumbnail: (file = "thumbnail.jpg") => `https://${cdnHost}/${guid}/${file}`,
  };
}

/** Identifiant Bunny d'une ligne média (ou null si la vidéo n'est pas chez Bunny). */
export function bunnyGuidOf(row: { original_key?: string | null; hls_key?: string | null }): string | null {
  const c = bunnyConfig();
  if (!c) return null;
  for (const key of [row.hls_key, row.original_key]) {
    if (!key || !key.startsWith(`https://${c.cdnHost}/`)) continue;
    const m = key.match(/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i);
    if (m) return m[1];
  }
  return null;
}

/** Crée l'objet vidéo (vide) ; l'envoi se fait ensuite par TUS depuis le navigateur. */
export async function bunnyCreateVideo(title: string): Promise<string> {
  const { libraryId } = cfg();
  const data = await call<{ guid: string }>(`/library/${libraryId}/videos`, { method: "POST", json: { title } });
  if (!data.guid) throw new Error("Bunny Stream : identifiant vidéo absent");
  return data.guid;
}

/** Cible d'envoi TUS signée (6 h), consommée par lib/media/uploader (mode « bunny »). */
export function bunnyTusTarget(guid: string, mime: string, title: string) {
  const { libraryId, apiKey } = cfg();
  const expire = Math.floor(Date.now() / 1000) + 6 * 3600;
  const signature = createHash("sha256").update(`${libraryId}${apiKey}${expire}${guid}`).digest("hex");
  return {
    mode: "bunny" as const,
    endpoint: `${API}/tusupload`,
    headers: { AuthorizationSignature: signature, AuthorizationExpire: String(expire), VideoId: guid, LibraryId: libraryId },
    metadata: { filetype: mime || "video/mp4", title },
  };
}

export type BunnyVideo = {
  guid: string;
  status: number;
  encodeProgress: number;
  availableResolutions: string | null;
  thumbnailFileName: string | null;
  length: number;
  width: number;
  height: number;
  storageSize: number;
};

export async function bunnyGetVideo(guid: string): Promise<BunnyVideo> {
  const { libraryId } = cfg();
  return call<BunnyVideo>(`/library/${libraryId}/videos/${guid}`);
}

export async function bunnyDeleteVideo(guid: string): Promise<void> {
  const { libraryId } = cfg();
  await call(`/library/${libraryId}/videos/${guid}`, { method: "DELETE" });
}

/** Jeton attendu dans l'URL du webhook Bunny (dérivé de la clé, jamais la clé elle-même). */
export function bunnyWebhookToken(): string {
  const { apiKey } = cfg();
  return createHash("sha256").update(`atlas-bunny-webhook:${apiKey}`).digest("hex").slice(0, 40);
}

/**
 * États Bunny : 0 en file, 1 traitement, 2 encodage, 3 terminé, 4 première qualité prête,
 * 5 échec, 6/7/8 envoi présigné (démarré / fini / échoué), 9 sous-titres générés,
 * 10 titre généré. Lisible dès 3, 4, 9, 10, ou dès qu'une qualité est disponible.
 */
export function bunnyState(v: BunnyVideo): "uploaded" | "processing" | "ready" | "failed" {
  const resolutions = (v.availableResolutions ?? "").split(",").filter(Boolean);
  if (v.status === 5 || v.status === 8) return "failed";
  // Lisible dès qu'une qualité existe (le master HLS liste celles disponibles)
  if (resolutions.length > 0 && ([3, 4, 9, 10].includes(v.status) || v.encodeProgress >= 100)) return "ready";
  if (v.status === 0 && !v.encodeProgress) return "uploaded";
  return "processing";
}

/** Encodage Bunny encore en cours (d'autres qualités arrivent) : marqué par transcode_started_at. */
export function bunnyStillEncoding(row: { video_status: string | null; transcode_started_at: string | null }): boolean {
  return row.video_status !== "failed" && (row.video_status !== "ready" || row.transcode_started_at !== null);
}

/**
 * Relit l'état chez Bunny et met la ligne `media` à jour (statut, HLS, poster, dimensions,
 * durée, qualités). Appelé par le fournisseur (`run`), le Studio pendant le traitement, le
 * lecteur du fil, le webhook et le cron.
 */
export async function bunnySyncMedia(mediaId: string): Promise<TranscodeResult> {
  const db = createAdminClient();
  const { data: row } = await db.from("media").select("*").eq("id", mediaId).maybeSingle();
  if (!row || row.kind !== "video") return { status: "failed", remaining: 0, error: "média vidéo introuvable" };
  const guid = bunnyGuidOf(row);
  if (!guid) return { status: "failed", remaining: 0, error: "vidéo hors Bunny Stream" };
  let v: BunnyVideo;
  try {
    v = await bunnyGetVideo(guid);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/404/.test(message)) {
      await db.from("media").update({ video_status: "failed", video_error: "Vidéo absente chez Bunny Stream (envoi interrompu ?)" }).eq("id", mediaId);
      return { status: "failed", remaining: 0, error: message };
    }
    return { status: "processing", remaining: 1, error: message };
  }
  const state = bunnyState(v);
  const urls = bunnyUrls(guid);
  const resolutions = (v.availableResolutions ?? "")
    .split(",")
    .map((r) => Number.parseInt(r, 10))
    .filter((h) => Number.isFinite(h) && h > 0)
    .sort((a, b) => b - a);
  const width = v.width || row.width;
  const height = v.height || row.height;
  const orientation = width && height ? (width > height ? "landscape" : width < height ? "portrait" : "square") : row.orientation;
  const update: Partial<Tables<"media">> = {
    video_status: state,
    video_error: state === "failed" ? `Encodage refusé par Bunny Stream (état ${v.status})` : null,
    hls_key: urls.hls,
    renditions: resolutions.map((h) => ({ height: h, bandwidth: 0, key: `${guid}/${h}p` })),
    width,
    height,
    duration_s: v.length ? v.length : row.duration_s,
    orientation,
    transcode_attempts: (row.transcode_attempts ?? 0) + 1,
    // Marqueur « encodage en cours » : posé tant que Bunny n'a pas fini toutes les qualités
    transcode_started_at: state === "ready" && v.encodeProgress >= 100 ? null : (row.transcode_started_at ?? new Date().toISOString()),
  };
  // Poster : la vignette Bunny, sauf poster choisi par l'éditeur (image ou instant)
  if (row.poster_source === "auto" && v.thumbnailFileName && (!row.poster_key || row.poster_key.startsWith("https://"))) {
    update.poster_key = urls.thumbnail(v.thumbnailFileName);
  }
  await db.from("media").update(update).eq("id", mediaId);
  // remaining = 0 : rien à relancer côté app, Bunny poursuit seul (le sondage relit l'état)
  if (state === "failed") return { status: "failed", remaining: 0, error: String(update.video_error) };
  return { status: state === "ready" ? "ready" : "processing", remaining: 0 };
}
