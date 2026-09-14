import { NextResponse, type NextRequest } from "next/server";
import { dispatchNotifications } from "@/lib/notifications/dispatch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}` || req.nextUrl.searchParams.get("secret") === secret;
}

/** Vide la file de notifications push. Appelé par Vercel Cron ou pg_net (CRON_SECRET). */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "non autorisé" }, { status: 401 });
  const result = await dispatchNotifications(50);
  return NextResponse.json(result);
}

export const POST = GET;
