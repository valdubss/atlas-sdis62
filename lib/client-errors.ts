"use client";

/**
 * Remontée des erreurs survenues sur l'appareil (fil, Studio, envoi de médias) vers le
 * journal d'administration : `/api/journal/client`. Les doublons d'une même minute sont
 * ignorés, 20 envois au plus par chargement de page. Jamais bloquant : tout échec est tu.
 */
const sent = new Map<string, number>();
let budget = 20;

export type ClientErrorContext = Record<string, string | number | boolean | null | undefined>;

export function reportClientError(error: unknown, context: ClientErrorContext = {}) {
  try {
    if (typeof window === "undefined" || budget <= 0) return;
    const message = (error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error)).slice(0, 500);
    if (!message || /ResizeObserver loop|Load failed|NetworkError|Failed to fetch|AbortError/.test(message)) return;
    const key = `${context.where ?? ""}|${message}`;
    const now = Date.now();
    if ((sent.get(key) ?? 0) > now - 60_000) return;
    sent.set(key, now);
    budget--;
    const payload = {
      message,
      stack: error instanceof Error && error.stack ? error.stack.slice(0, 3000) : null,
      url: window.location.pathname + window.location.search,
      context: { ...context, ua: navigator.userAgent.slice(0, 200), online: navigator.onLine, version: process.env.NEXT_PUBLIC_APP_VERSION ?? null },
    };
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon && navigator.sendBeacon("/api/journal/client", new Blob([body], { type: "application/json" }))) return;
    fetch("/api/journal/client", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch {
    /* jamais bloquant */
  }
}

/** Écoute les erreurs non rattrapées de la page (une seule fois). */
export function installClientErrorListeners(): () => void {
  if (typeof window === "undefined") return () => {};
  const onError = (e: ErrorEvent) => reportClientError(e.error ?? e.message, { where: "window", source: e.filename ? `${e.filename}:${e.lineno}` : undefined });
  const onRejection = (e: PromiseRejectionEvent) => reportClientError(e.reason, { where: "promise" });
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
