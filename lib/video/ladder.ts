/**
 * Échelle des rendus HLS (sans ffmpeg : importable partout). Jamais au-dessus de la source.
 */
export const LADDER: { height: number; bitrateK: number; audioK: number }[] = [
  { height: 1080, bitrateK: 2600, audioK: 96 },
  { height: 720, bitrateK: 1500, audioK: 64 },
  { height: 360, bitrateK: 600, audioK: 64 },
];

export type Rendition = { height: number; bandwidth: number; key: string; width?: number };

/** Rendus encore à produire pour une ligne média (selon la hauteur de la source). */
export function pendingRenditions(row: { renditions: unknown; height: number | null }): { height: number; bitrateK: number; audioK: number }[] {
  const done = new Set(((row.renditions as Rendition[]) ?? []).map((r) => r.height));
  const srcHeight = Math.min(row.height ?? 1080, 1080);
  if (done.size === 0) return LADDER.filter((l) => l.height <= srcHeight);
  return LADDER.filter((l) => l.height < srcHeight && !done.has(l.height) && l.height < Math.max(...done));
}
