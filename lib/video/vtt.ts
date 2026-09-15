/** Sous-titres WebVTT : analyse et sérialisation (édition ligne par ligne dans le studio). */
export type Cue = { start: number; end: number; text: string };

const TIME = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;

export function parseTime(s: string): number | null {
  const m = TIME.exec(s.trim());
  if (!m) return null;
  const h = m[1] ? Number(m[1]) : 0;
  const ms = Number(m[4].padEnd(3, "0"));
  return h * 3600 + Number(m[2]) * 60 + Number(m[3]) + ms / 1000;
}

export function formatTime(t: number): string {
  const total = Math.max(0, t);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const ms = Math.round((total - Math.floor(total)) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

/** Accepte WebVTT et SubRip (.srt) ; ignore les en-têtes, notes et styles. */
export function parseVtt(input: string): Cue[] {
  const text = input.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const blocks = text.split(/\n{2,}/);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    if (lines.length === 0) continue;
    if (/^(WEBVTT|NOTE|STYLE|REGION)/.test(lines[0])) continue;
    let idx = lines.findIndex((l) => l.includes("-->"));
    if (idx < 0) continue;
    const [a, b] = lines[idx].split("-->");
    const start = parseTime(a.trim());
    const end = parseTime(b.trim().split(/\s+/)[0] ?? "");
    if (start === null || end === null || end < start) continue;
    idx += 1;
    const body = lines
      .slice(idx)
      .join("\n")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (!body) continue;
    cues.push({ start, end, text: body });
  }
  return cues.sort((x, y) => x.start - y.start);
}

export function serializeVtt(cues: Cue[]): string {
  const lines = ["WEBVTT", ""];
  cues
    .filter((c) => c.text.trim() !== "" && c.end > c.start)
    .sort((a, b) => a.start - b.start)
    .forEach((c, i) => {
      lines.push(String(i + 1), `${formatTime(c.start)} --> ${formatTime(c.end)}`, c.text.trim(), "");
    });
  return lines.join("\n");
}

/** Découpe un texte transcrit (segments avec temps) en cues courtes (≤ 2 lignes, ≤ 84 caractères). */
export function cuesFromSegments(segments: { start: number; end: number; text: string }[]): Cue[] {
  const out: Cue[] = [];
  for (const seg of segments) {
    const words = seg.text.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    const chunks: string[] = [];
    let cur = "";
    for (const w of words) {
      if ((cur + " " + w).trim().length > 84) {
        chunks.push(cur.trim());
        cur = w;
      } else cur = (cur + " " + w).trim();
    }
    if (cur) chunks.push(cur);
    const dur = Math.max(0.5, seg.end - seg.start);
    chunks.forEach((c, i) => out.push({ start: seg.start + (dur * i) / chunks.length, end: seg.start + (dur * (i + 1)) / chunks.length, text: c }));
  }
  return out;
}
