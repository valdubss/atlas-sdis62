import { NextResponse, type NextRequest } from "next/server";
import { sendWeeklyDigest } from "@/lib/email/digest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Digest hebdomadaire (Vercel Cron, lundi 7 h Paris = 5 h UTC en été). Protégé par CRON_SECRET. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization");
  if (!secret || (header !== `Bearer ${secret}` && req.nextUrl.searchParams.get("secret") !== secret)) {
    return NextResponse.json({ error: "non autorisé" }, { status: 401 });
  }
  const result = await sendWeeklyDigest();
  return NextResponse.json(result);
}
