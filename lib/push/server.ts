import "server-only";

import webPush from "web-push";

let configured = false;

function ensureConfigured() {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webPush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:communication@sdis62.fr", pub, priv);
  configured = true;
  return true;
}

export type PushPayload = { title: string; body: string; url: string; tag?: string };

/**
 * Envoie une notification à un abonnement. Renvoie "gone" si l'abonnement
 * n'existe plus côté navigateur (404/410) : à supprimer en base.
 */
export async function sendPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload,
): Promise<{ status: "sent" } | { status: "gone" } | { status: "error"; message: string }> {
  if (!ensureConfigured()) return { status: "error", message: "clés VAPID absentes" };
  try {
    await webPush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), {
      TTL: 60 * 60 * 24,
      urgency: "normal",
    });
    return { status: "sent" };
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return { status: "gone" };
    const body = (e as { body?: string }).body?.slice(0, 120);
    const message = `${status ?? "réseau"} ${body || (e as Error).message}`.trim();
    console.error("web-push", message);
    return { status: "error", message };
  }
}
