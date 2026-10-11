import { NextResponse, type NextRequest } from "next/server";
import { dispatchNotifications, flushDeferred, runMaintenance } from "@/lib/notifications/dispatch";
import { isCronAuthorized } from "@/lib/auth/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 60;


/**
 * Vide la file de notifications push, puis entretien (purges). Appelé par
 * Vercel Cron ou pg_net avec l'en-tête `Authorization: Bearer CRON_SECRET`.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "non autorisé" }, { status: 401 });
  const result = await dispatchNotifications(50);
  // Fin de plage de silence : pushs regroupées, même si la file est vide
  const deferred = await flushDeferred().catch((e) => ({ error: String(e) }));
  const maintenance = await runMaintenance().catch((e) => ({ error: String(e) }));
  return NextResponse.json({ ...result, deferred, maintenance });
}

export const POST = GET;
