import { toLocalInput } from "./time";

const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
const TZ = "Europe/Paris";
const dateShort = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, day: "numeric", month: "short" });
const dateLong = new Intl.DateTimeFormat("fr-FR", {
  timeZone: TZ,
  day: "numeric",
  month: "long",
  year: "numeric",
});
const dateTime = new Intl.DateTimeFormat("fr-FR", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** « à l'instant », « il y a 5 min », « il y a 3 h », « hier », « 12 sept. » */
export function formatRelative(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  const diff = Math.round((d - now) / 1000);
  const abs = Math.abs(diff);
  if (abs < 45) return "à l'instant";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute").replace("minutes", "min").replace("minute", "min");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour").replace("heures", "h").replace("heure", "h");
  if (abs < 86400 * 2) return rtf.format(Math.round(diff / 86400), "day");
  const date = new Date(iso);
  if (date.getFullYear() === new Date(now).getFullYear()) return dateShort.format(date);
  return dateLong.format(date);
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "";
  return dateTime.format(new Date(iso));
}

export function formatDateLong(iso: string | null | undefined) {
  if (!iso) return "";
  return dateLong.format(new Date(iso));
}

/** Valeur pour <input type="datetime-local"> en heure locale. */
/** Valeur pour <input type="datetime-local"> en heure de Paris (voir lib/time.ts). */
export function toDatetimeLocal(iso: string | null | undefined) {
  return toLocalInput(iso);
}
