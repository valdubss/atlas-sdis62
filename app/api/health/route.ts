import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

export type ServiceStatus = "ok" | "degraded" | "down";
export type Health = {
  checked_at: string;
  services: { key: "db" | "storage" | "video" | "notifications" | "messaging"; label: string; status: ServiceStatus; detail: string; latency_ms?: number }[];
  version: string;
};

async function timed<T>(fn: () => Promise<T>): Promise<{ value?: T; error?: string; ms: number }> {
  const t0 = Date.now();
  try {
    const value = await Promise.race([fn(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("délai dépassé (8 s)")), 8000))]);
    return { value, ms: Date.now() - t0 };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 };
  }
}

/**
 * État des services : base (RPC), stockage (lecture d'un objet public), vidéo
 * (transcodage en attente / échecs), notifications (file, dernier envoi).
 * Public (aucune donnée sensible), mis en cache 30 s par le CDN.
 */
export async function GET() {
  const admin = createAdminClient();
  const db = await timed(async () => {
    const { data, error } = await admin.rpc("health_snapshot");
    if (error) throw new Error(error.message);
    return data as unknown as { queue_pending: number; queue_failed_24h: number; last_sent_at: string | null; video_processing: number; video_failed_24h: number; media_failed_24h: number; open_incidents: number };
  });
  const storage = await timed(async () => {
    const url = getStorage().publicUrl("icons/icon-192.png");
    const res = await fetch(url, { method: "HEAD", cache: "no-store" });
    // Le bucket peut ne pas contenir cet objet : 404 signifie « joignable »
    if (res.status >= 500) throw new Error(`stockage HTTP ${res.status}`);
    return res.status;
  });
  const snap = db.value;
  const services: Health["services"] = [
    { key: "db", label: "Base de données", status: db.error ? "down" : db.ms > 2500 ? "degraded" : "ok", detail: db.error ?? `réponse en ${db.ms} ms`, latency_ms: db.ms },
    { key: "storage", label: "Stockage des médias", status: storage.error ? "down" : storage.ms > 2500 ? "degraded" : "ok", detail: storage.error ?? `réponse en ${storage.ms} ms`, latency_ms: storage.ms },
    {
      key: "video",
      label: "Vidéo (transcodage)",
      status: !snap ? "degraded" : snap.video_failed_24h > 3 ? "degraded" : "ok",
      detail: snap ? `${snap.video_processing} en cours, ${snap.video_failed_24h} échec${snap.video_failed_24h > 1 ? "s" : ""} sur 24 h` : "état inconnu",
    },
    {
      key: "notifications",
      label: "Notifications push",
      status: !snap ? "degraded" : snap.queue_failed_24h > 5 || (snap.queue_pending > 50 && (!snap.last_sent_at || Date.now() - new Date(snap.last_sent_at).getTime() > 2 * 3_600_000)) ? "degraded" : "ok",
      detail: snap ? `${snap.queue_pending} en attente, ${snap.queue_failed_24h} échec${snap.queue_failed_24h > 1 ? "s" : ""} sur 24 h${snap.last_sent_at ? `, dernier envoi ${new Date(snap.last_sent_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}` : ""}` : "état inconnu",
    },
    { key: "messaging", label: "Messagerie (temps réel)", status: db.error ? "down" : "ok", detail: db.error ? "base injoignable" : "canaux servis par la base" },
  ];
  const body: Health = { checked_at: new Date().toISOString(), services, version: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev" };
  const worst = services.some((s) => s.status === "down") ? 503 : 200;
  return NextResponse.json(body, { status: worst, headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } });
}
