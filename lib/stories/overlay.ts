/**
 * Superpositions de story (texte, sondage, question) : positions relatives
 * (0–1) sur un cadre 9:16, zones masquées par l'interface du viewer.
 */

/** Zones recouvertes par l'interface du viewer (barres, en-tête, pied de réponse). */
export const MASKED_ZONES = { top: 0.14, bottom: 0.22 } as const;

export const POLL_OPTIONS_MIN = 2;
export const POLL_OPTIONS_MAX = 4;
export const POLL_OPTION_MAX_LENGTH = 30;
export const POLL_QUESTION_MAX_LENGTH = 80;
export const QUESTION_PROMPT_MAX_LENGTH = 80;
export const HIGHLIGHT_TITLE_MAX_LENGTH = 16;

/** Borne une coordonnée relative dans [0, 1] avec trois décimales. */
export function clampRel(v: number, min = 0, max = 1): number {
  if (!Number.isFinite(v)) return min;
  return Math.round(Math.min(max, Math.max(min, v)) * 1000) / 1000;
}

/** Position relative d'un pointeur dans un cadre. */
export function relFromPointer(rect: { left: number; top: number; width: number; height: number }, clientX: number, clientY: number) {
  return {
    x: clampRel(rect.width > 0 ? (clientX - rect.left) / rect.width : 0),
    y: clampRel(rect.height > 0 ? (clientY - rect.top) / rect.height : 0),
  };
}

/** Vrai si un centre placé à `y` tombe dans une zone masquée par le viewer. */
export function inMaskedZone(y: number): boolean {
  return y < MASKED_ZONES.top || y > 1 - MASKED_ZONES.bottom;
}

/** Ramène `y` dans la zone visible (utile après un glisser). */
export function snapToVisible(y: number): number {
  return clampRel(y, MASKED_ZONES.top, 1 - MASKED_ZONES.bottom);
}

/** Position verticale préréglée (texte) → relative. */
export function presetToY(position: "top" | "middle" | "bottom" | undefined): number {
  return position === "top" ? 0.22 : position === "middle" ? 0.5 : 0.76;
}

/** Nettoie les options d'un sondage : trim, vides retirées, doublons retirés. */
export function normalizePollOptions(raw: string[]): string[] {
  const out: string[] = [];
  for (const r of raw) {
    const t = r.trim().slice(0, POLL_OPTION_MAX_LENGTH);
    if (!t) continue;
    if (out.some((o) => o.toLowerCase() === t.toLowerCase())) continue;
    out.push(t);
  }
  return out.slice(0, POLL_OPTIONS_MAX);
}

/** Validation d'un sondage ; renvoie un message d'erreur ou null. */
export function validatePoll(question: string, options: string[]): string | null {
  const q = question.trim();
  if (!q) return "Posez une question.";
  if (q.length > POLL_QUESTION_MAX_LENGTH) return `${POLL_QUESTION_MAX_LENGTH} caractères maximum pour la question.`;
  const opts = normalizePollOptions(options);
  if (opts.length < POLL_OPTIONS_MIN) return "Deux réponses différentes au moins.";
  if (opts.length > POLL_OPTIONS_MAX) return `${POLL_OPTIONS_MAX} réponses au plus.`;
  return null;
}

/** Pourcentages entiers (somme 100 quand il y a des votes). */
export function pollPercentages(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return counts.map(() => 0);
  const raw = counts.map((c) => (c / total) * 100);
  const floors = raw.map(Math.floor);
  let rest = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (rest <= 0) break;
    floors[i] += 1;
    rest -= 1;
  }
  return floors;
}
