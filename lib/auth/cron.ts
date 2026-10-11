import "server-only";

import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/** Requête porteuse de `Authorization: Bearer CRON_SECRET` (comparaison à temps constant). */
export function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  if (!secret || !header.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
