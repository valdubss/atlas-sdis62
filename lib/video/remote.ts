import "server-only";

/**
 * Accès au transcodage depuis les autres fonctions serveur (actions du Studio, cron) SANS
 * importer ffmpeg : seule la route `/api/video/transcode` embarque le binaire (80 Mo),
 * ce qui évite de le recopier dans chaque fonction du déploiement (stockage Vercel).
 * Appel serveur → serveur authentifié par CRON_SECRET ; les droits de l'utilisateur sont
 * vérifiés par l'appelant avant.
 */
function endpoint() {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  return `${base.replace(/\/$/, "")}/api/video/transcode`;
}

function headers() {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET manquant : transcodage interne impossible");
  return { "content-type": "application/json", authorization: `Bearer ${secret}` };
}

/** Lance (ou poursuit) le transcodage d'un média dans le budget donné. */
export async function runRemoteTranscode(mediaId: string, budgetMs: number): Promise<{ status: string; remaining: number; error?: string }> {
  const res = await fetch(endpoint(), { method: "POST", headers: headers(), body: JSON.stringify({ mediaId, budgetMs }), cache: "no-store" });
  const json = (await res.json().catch(() => null)) as { status?: string; remaining?: number; error?: string } | null;
  if (!res.ok || !json) throw new Error(json?.error ?? `transcodage : réponse ${res.status}`);
  return { status: json.status ?? "failed", remaining: json.remaining ?? 0, error: json.error };
}

/** Image fixe (JPEG) à un instant donné de la vidéo. */
export async function remoteFrameAt(mediaId: string, timeS: number): Promise<Buffer> {
  const res = await fetch(endpoint(), { method: "POST", headers: headers(), body: JSON.stringify({ mediaId, action: "frame", timeS }), cache: "no-store" });
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(json?.error ?? `image fixe : réponse ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}
