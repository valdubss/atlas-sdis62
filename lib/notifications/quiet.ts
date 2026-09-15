/**
 * Plage de silence (par agent, heure de Paris) : les pushs non urgentes émises
 * pendant la plage sont mises en attente et regroupées à la fin de la plage.
 * Fonctions pures, testées.
 */
export const APP_TZ = "Europe/Paris";

export type Clock = { h: number; m: number };

export function parseClock(s: string | null | undefined, fallback: Clock): Clock {
  const m = /^(\d{1,2}):(\d{2})/.exec(s ?? "");
  if (!m) return fallback;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h >= 0 && h < 24 && mi >= 0 && mi < 60 ? { h, m: mi } : fallback;
}

const minutes = (c: Clock) => c.h * 60 + c.m;

/** Heure locale (Paris) d'un instant. */
export function localClock(at: Date, tz = APP_TZ): Clock & { y: number; mo: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { y: get("year"), mo: get("month"), d: get("day"), h: get("hour") % 24, m: get("minute") };
}

/** Vrai si l'instant est dans la plage [start, end) ; la plage peut chevaucher minuit ; start = end → jamais. */
export function isQuiet(at: Date, start: Clock, end: Clock, tz = APP_TZ): boolean {
  const now = minutes(localClock(at, tz));
  const s = minutes(start);
  const e = minutes(end);
  if (s === e) return false;
  return s < e ? now >= s && now < e : now >= s || now < e;
}

/** Prochain instant (UTC) où la plage se termine, à partir de `at` (supposé dans la plage). */
export function nextQuietEnd(at: Date, end: Clock, tz = APP_TZ): Date {
  const local = localClock(at, tz);
  // Candidat : aujourd'hui à `end` (heure de Paris), sinon demain
  for (const dayOffset of [0, 1]) {
    const candidate = zonedToUtc(local.y, local.mo, local.d + dayOffset, end.h, end.m, tz);
    if (candidate.getTime() > at.getTime()) return candidate;
  }
  return zonedToUtc(local.y, local.mo, local.d + 2, end.h, end.m, tz);
}

/** Convertit une heure locale (tz) en instant UTC, en corrigeant le décalage (DST compris). */
export function zonedToUtc(y: number, mo: number, d: number, h: number, m: number, tz = APP_TZ): Date {
  const guess = new Date(Date.UTC(y, mo - 1, d, h, m, 0, 0));
  const local = localClock(guess, tz);
  const asUtc = Date.UTC(local.y, local.mo - 1, local.d, local.h, local.m);
  const offset = asUtc - guess.getTime();
  return new Date(guess.getTime() - offset);
}

/** Regroupe des pushs différées d'un même agent en une seule notification. */
export function groupDeferred(items: { title: string; body: string; url: string }[]): { title: string; body: string; url: string } | null {
  if (items.length === 0) return null;
  if (items.length === 1) return items[0];
  const n = items.length;
  return { title: `${n} nouveautés cette nuit`, body: items.slice(0, 3).map((i) => i.title).join(" · "), url: "/notifications" };
}
