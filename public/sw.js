/* ATLAS — service worker
 * Cache de l'interface uniquement (jamais des médias) et notifications push.
 */
// Version = paramètre ?v= de l'URL d'enregistrement (version de l'app) : chaque
// déploiement installe un nouveau worker et purge l'ancien cache.
const VERSION = "atlas-" + (new URL(self.location.href).searchParams.get("v") || "dev");
const SHELL = ["/offline", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Médias, Supabase, autres origines : jamais mis en cache
  if (url.origin !== self.location.origin) return;

  // Fichiers statiques versionnés : cache d'abord
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(request, copy));
            return res;
          }),
      ),
    );
    return;
  }

  // Navigations : réseau d'abord, page hors ligne en secours
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline")));
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "ATLAS", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "ATLAS";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.tag || data.url || "atlas",
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (list) => {
      const own = list.find((c) => new URL(c.url).origin === self.location.origin);
      if (own) {
        const focused = "focus" in own ? await own.focus() : own;
        if ("navigate" in focused) {
          try {
            await focused.navigate(url);
          } catch {
            return self.clients.openWindow(url);
          }
        }
        return focused;
      }
      return self.clients.openWindow(url);
    }),
  );
});
