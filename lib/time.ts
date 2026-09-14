/**
 * Fuseau de référence de l'application. Les champs <input type="datetime-local">
 * n'ont pas de fuseau : on les interprète toujours en heure de Paris, quel que
 * soit le fuseau du serveur (UTC sur Vercel).
 */
export const APP_TZ = "Europe/Paris";

const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Décalage (minutes) entre l'heure de Paris et UTC à un instant donné. */
function offsetMinutes(at: Date): number {
  const parts = partsFmt.formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** « 2026-09-15T08:00 » (heure de Paris) → Date UTC. `null` si invalide. */
export function fromLocalInput(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  // Deux passes : le décalage peut changer autour d'un changement d'heure.
  let utc = wall - offsetMinutes(new Date(wall)) * 60000;
  utc = wall - offsetMinutes(new Date(utc)) * 60000;
  const date = new Date(utc);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Date UTC → valeur « YYYY-MM-DDTHH:mm » en heure de Paris pour un champ datetime-local. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = partsFmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
