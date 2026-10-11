import "server-only";

/**
 * Cloudflare Stream Live : une « entrée en direct » par Direct vidéo. Diffusion depuis l'app
 * par WebRTC (WHIP), lecture par WebRTC (WHEP, latence inférieure à la seconde) ; la même
 * entrée accepte aussi un encodeur RTMP (OBS, caméra), auquel cas la lecture HLS et
 * l'enregistrement automatique existent en plus.
 *
 * Variables : CF_ACCOUNT_ID, CF_STREAM_API_TOKEN (jeton « Stream : modifier »),
 * CF_STREAM_CUSTOMER_CODE (sous-domaine customer-xxxx.cloudflarestream.com, pour HLS).
 */
export type LiveInput = { uid: string; whipUrl: string; whepUrl: string; rtmpUrl: string; streamKey: string; hlsUrl: string | null };

export function cloudflareLiveConfigured(): boolean {
  return Boolean(process.env.CF_ACCOUNT_ID && process.env.CF_STREAM_API_TOKEN);
}

async function call<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const account = process.env.CF_ACCOUNT_ID;
  const token = process.env.CF_STREAM_API_TOKEN;
  if (!account || !token) throw new Error("Cloudflare Stream non configuré (CF_ACCOUNT_ID, CF_STREAM_API_TOKEN)");
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/stream${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.json !== undefined ? { "content-type": "application/json" } : {}), ...(init.headers ?? {}) },
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as { success?: boolean; result?: T; errors?: { message: string }[] } | null;
  if (!res.ok || !json?.success) throw new Error(`Cloudflare Stream : ${json?.errors?.[0]?.message ?? res.statusText}`);
  return json.result as T;
}

type RawInput = {
  uid: string;
  rtmps?: { url: string; streamKey: string };
  webRTC?: { url: string };
  webRTCPlayback?: { url: string };
};

/** Crée l'entrée en direct (enregistrement automatique pour un flux RTMP). */
export async function createLiveInput(name: string): Promise<LiveInput> {
  const r = await call<RawInput>("/live_inputs", { method: "POST", json: { meta: { name: name.slice(0, 120) }, recording: { mode: "automatic", timeoutSeconds: 30 } } });
  const code = process.env.CF_STREAM_CUSTOMER_CODE;
  return {
    uid: r.uid,
    whipUrl: r.webRTC?.url ?? "",
    whepUrl: r.webRTCPlayback?.url ?? "",
    rtmpUrl: r.rtmps?.url ?? "",
    streamKey: r.rtmps?.streamKey ?? "",
    hlsUrl: code ? `https://customer-${code}.cloudflarestream.com/${r.uid}/manifest/video.m3u8` : null,
  };
}

export async function deleteLiveInput(uid: string): Promise<void> {
  await call(`/live_inputs/${uid}`, { method: "DELETE" }).catch(() => undefined);
}
