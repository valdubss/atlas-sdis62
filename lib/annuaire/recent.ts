/** « Consultés récemment » de l'annuaire : sur l'appareil seulement (5 fiches). */
export type RecentEntry = { kind: "centre" | "service"; slug: string; name: string; at: number };

const KEY = "atlas:annuaire:recents";
const MAX = 5;

export const recentSheets = {
  read(): RecentEntry[] {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
      return Array.isArray(v) ? v.filter((x): x is RecentEntry => x && typeof x.slug === "string" && (x.kind === "centre" || x.kind === "service")).slice(0, MAX) : [];
    } catch {
      return [];
    }
  },
  push(entry: Omit<RecentEntry, "at">): RecentEntry[] {
    const next = [{ ...entry, at: Date.now() }, ...recentSheets.read().filter((x) => !(x.kind === entry.kind && x.slug === entry.slug))].slice(0, MAX);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
    return next;
  },
  clear() {
    try {
      localStorage.removeItem(KEY);
    } catch {}
  },
};
