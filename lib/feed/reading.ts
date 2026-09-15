/** Lecture des articles et du fil : helpers purs (testés). */

/** Temps de lecture estimé (200 mots / min), 1 min au moins. */
export function readingTimeMinutes(text: string): number {
  const words = text
    .replace(/[#*_>`\[\]()]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export type TocEntry = { id: string; text: string };

/** Identifiant stable d'un titre (comme celui que rend le Markdown). */
export function slugifyHeading(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Sommaire : les titres de niveau 2 d'un texte Markdown. */
export function extractToc(markdown: string): TocEntry[] {
  const out: TocEntry[] = [];
  const seen = new Map<string, number>();
  for (const line of markdown.split(/\r?\n/)) {
    const m = /^##\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const text = m[1].replace(/[*_`]/g, "").trim();
    let id = slugifyHeading(text) || "section";
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    if (n > 0) id = `${id}-${n + 1}`;
    out.push({ id, text });
  }
  return out;
}

/** Progression de lecture (0–1) d'un élément selon le défilement de la fenêtre. */
export function readingProgress(top: number, height: number, viewport: number, scrollY: number): number {
  const start = top;
  const end = top + height - viewport;
  if (end <= start) return scrollY >= start ? 1 : 0;
  return Math.min(1, Math.max(0, (scrollY - start) / (end - start)));
}

/** Mémoire de défilement par route (sessionStorage), pour revenir au même endroit. */
export const scrollMemory = {
  key: (path: string) => `atlas:scroll:${path}`,
  save(path: string, y: number) {
    try {
      sessionStorage.setItem(scrollMemory.key(path), String(Math.round(y)));
    } catch {}
  },
  read(path: string): number | null {
    try {
      const v = sessionStorage.getItem(scrollMemory.key(path));
      return v === null ? null : Number(v);
    } catch {
      return null;
    }
  },
};

/** Position de reprise d'un article (localStorage), gardée entre 5 % et 95 %. */
export const resumeMemory = {
  key: (slug: string) => `atlas:article:${slug}`,
  save(slug: string, fraction: number) {
    try {
      if (fraction > 0.05 && fraction < 0.95) localStorage.setItem(resumeMemory.key(slug), fraction.toFixed(3));
      else if (fraction >= 0.95) localStorage.removeItem(resumeMemory.key(slug));
    } catch {}
  },
  read(slug: string): number | null {
    try {
      const v = localStorage.getItem(resumeMemory.key(slug));
      return v === null ? null : Number(v);
    } catch {
      return null;
    }
  },
};

/** Historique local des 5 dernières recherches. */
export const searchHistory = {
  key: "atlas:search:history",
  read(): string[] {
    try {
      const v = JSON.parse(localStorage.getItem(searchHistory.key) ?? "[]");
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 5) : [];
    } catch {
      return [];
    }
  },
  push(q: string): string[] {
    const t = q.trim();
    if (!t) return searchHistory.read();
    const next = [t, ...searchHistory.read().filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 5);
    try {
      localStorage.setItem(searchHistory.key, JSON.stringify(next));
    } catch {}
    return next;
  },
  clear() {
    try {
      localStorage.removeItem(searchHistory.key);
    } catch {}
  },
};
