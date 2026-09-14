"use client";

/** Utilitaires navigateur pour l'abonnement Web Push. */

/** URL du service worker, versionnée : un déploiement = un nouveau worker. */
export const SW_URL = `/sw.js?v=${process.env.NEXT_PUBLIC_APP_VERSION ?? "dev"}`;

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function registration() {
  const existing = await navigator.serviceWorker.getRegistration("/");
  return existing ?? (await navigator.serviceWorker.register(SW_URL, { scope: "/" }));
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await registration();
  return reg.pushManager.getSubscription();
}

/** Demande la permission et crée l'abonnement ; renvoie son JSON à enregistrer côté serveur. */
export async function subscribeBrowser(vapidPublicKey: string): Promise<PushSubscriptionJSON> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications refusées dans le navigateur.");
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) }));
  return sub.toJSON();
}

export async function unsubscribeBrowser(): Promise<string | null> {
  const sub = await currentSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return endpoint;
}
