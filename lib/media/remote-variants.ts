import "server-only";

/**
 * Traitement d'images (sharp, 28 Mo de binaires) confiné à la route `/api/media/variants` :
 * les actions du Studio, de la messagerie et du profil l'appellent par HTTP interne au lieu
 * d'embarquer sharp dans chacune de leurs fonctions (stockage Vercel). Authentification par
 * CRON_SECRET ; les droits de l'utilisateur sont vérifiés par l'appelant avant.
 */
export type VariantKeys = { thumb: string; small: string; medium: string; full: string };
export type VariantsResult = { variants: VariantKeys; width: number; height: number; lqip: string | null };

function endpoint() {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  return `${base.replace(/\/$/, "")}/api/media/variants`;
}

async function call<T>(body: unknown): Promise<T> {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error("CRON_SECRET manquant : traitement d'image interne impossible");
  const res = await fetch(endpoint(), { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${secret}` }, body: JSON.stringify(body), cache: "no-store" });
  const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !json) throw new Error(json?.error ?? `traitement d'image : réponse ${res.status}`);
  return json;
}

/** Variantes WebP (400 / 800 / 1200 / 2400 px) + dimensions + aperçu flou d'un original déjà stocké. */
export function remoteImageVariants(mediaId: string, originalKey: string): Promise<VariantsResult> {
  return call<VariantsResult>({ kind: "variants", mediaId, originalKey });
}

/** Avatar 256 px WebP à partir d'un original temporaire stocké ; écrit `outKey` et supprime le temporaire. */
export function remoteAvatar(tempKey: string, outKey: string): Promise<{ key: string }> {
  return call<{ key: string }>({ kind: "avatar", tempKey, outKey });
}
