import type { Conversation, DirectoryPerson, Message, MessageMedia } from "./types";

/** Limites de la messagerie (brief lot 6). */
export const MESSAGE_LIMITS = {
  bodyMax: 4000,
  imagesPerMessage: 10,
  imageMaxBytes: 8 * 1024 * 1024,
  videoMaxSeconds: 60,
  videoMaxBytes: 50 * 1024 * 1024,
  fileMaxBytes: 25 * 1024 * 1024,
  voiceMaxSeconds: 120,
  voiceMaxBytes: 5 * 1024 * 1024,
  groupNameMax: 40,
  subjectMax: 120,
  pinnedMax: 3,
  deleteWindowMs: 15 * 60_000,
} as const;

export const FILE_MIMES = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"] as const;

/** Six couleurs d'auteur (gris-bleus), attribuées de façon stable par identifiant. */
export const AUTHOR_COLORS = ["#8FA3BF", "#9DB4A0", "#B9A58F", "#A899B8", "#8FB3B8", "#B89E9E"] as const;

export function authorColor(id: string | null | undefined): string {
  if (!id) return AUTHOR_COLORS[0];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AUTHOR_COLORS[h % AUTHOR_COLORS.length];
}

/**
 * Bulles consécutives d'un même auteur (moins de 5 min d'écart) : la première
 * porte le nom, la dernière l'heure ; les coins côté auteur sont réduits entre elles.
 */
export type BubblePosition = "single" | "first" | "middle" | "last";

export function bubblePositions(messages: Pick<Message, "id" | "author" | "type" | "created_at">[]): Record<string, BubblePosition> {
  const out: Record<string, BubblePosition> = {};
  const same = (a: (typeof messages)[number], b: (typeof messages)[number]) =>
    a.type !== "system" && b.type !== "system" && a.author?.id === b.author?.id && Math.abs(new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) < 5 * 60_000;
  for (let i = 0; i < messages.length; i++) {
    const prev = i > 0 && same(messages[i - 1], messages[i]);
    const next = i < messages.length - 1 && same(messages[i], messages[i + 1]);
    out[messages[i].id] = prev && next ? "middle" : prev ? "last" : next ? "first" : "single";
  }
  return out;
}

/** Séparateur de date : « Aujourd'hui », « Hier », sinon date longue. */
export function dateLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, now)) return "Aujourd'hui";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}

/** Vrai si un séparateur de date doit précéder le message `i`. */
export function needsDateSeparator(messages: Pick<Message, "created_at">[], i: number): boolean {
  if (i === 0) return true;
  const a = new Date(messages[i - 1].created_at);
  const b = new Date(messages[i].created_at);
  return a.toDateString() !== b.toDateString();
}

/** Aperçu d'une conversation (liste) : « Prénom : texte », « Photo », « Message vocal »… */
export function conversationPreview(c: Pick<Conversation, "last_message" | "type">): string {
  const m = c.last_message;
  if (!m) return c.type === "group" ? "Groupe créé" : "Aucun message";
  const text = m.type === "voice" ? "🎤 Message vocal" : m.type === "media" ? (m.body ? `📷 ${m.body}` : "📷 Photo ou fichier") : m.body;
  return m.author ? `${m.author.split(" ")[0]} : ${text}` : text;
}

/** Heure courte pour la liste : heure si aujourd'hui, jour sinon. */
export function shortTime(iso: string | null, now = new Date()): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const diff = (now.getTime() - d.getTime()) / 86_400_000;
  if (diff < 7) return d.toLocaleDateString("fr-FR", { weekday: "short" });
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

/** Mosaïque d'avatars : 1 → plein, 2 → côte à côte, 3 → 1 + 2, 4 → grille. */
export function mosaicLayout(n: number): "one" | "two" | "three" | "four" {
  if (n <= 1) return "one";
  if (n === 2) return "two";
  if (n === 3) return "three";
  return "four";
}

/** Grille des médias d'un message : 1 → plein, 2 → deux colonnes, ≥ 3 → 2×2 avec « +N ». */
export function mediaGrid(media: MessageMedia[]): { shown: MessageMedia[]; extra: number; cols: 1 | 2 } {
  if (media.length <= 1) return { shown: media, extra: 0, cols: 1 };
  const shown = media.slice(0, 4);
  return { shown, extra: Math.max(0, media.length - 4), cols: 2 };
}

/**
 * Mentions : « @Prénom Nom » ou « @tous » saisis dans le composeur. Renvoie les
 * identifiants reconnus et le drapeau « tout le monde ».
 */
export function parseMentions(body: string, people: Pick<DirectoryPerson, "id" | "first_name" | "last_name">[]): { mentions: string[]; mentionAll: boolean } {
  const mentionAll = /(^|\s)@tous\b/i.test(body);
  const mentions = new Set<string>();
  // 1. Noms complets d'abord (retirés du texte pour ne pas matcher ensuite le prénom seul)
  let rest = body;
  for (const p of people) {
    const full = `@${p.first_name} ${p.last_name}`.trim();
    if (full.length <= 1) continue;
    if (new RegExp(`(^|\\s)${escapeRegex(full)}(?=$|[\\s,.!?:;])`, "i").test(rest)) {
      mentions.add(p.id);
      rest = rest.replace(new RegExp(escapeRegex(full), "gi"), " ");
    }
  }
  // 2. Prénom seul : seulement s'il désigne une seule personne
  for (const p of people) {
    if (!p.first_name || mentions.has(p.id)) continue;
    if (people.filter((x) => x.first_name.toLowerCase() === p.first_name.toLowerCase()).length !== 1) continue;
    if (new RegExp(`(^|\\s)@${escapeRegex(p.first_name)}(?=$|[\\s,.!?:;])`, "i").test(rest)) mentions.add(p.id);
  }
  return { mentions: [...mentions], mentionAll };
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Texte tapé après le dernier « @ » (pour proposer des noms), ou null. */
export function mentionQuery(body: string, caret: number): string | null {
  const before = body.slice(0, caret);
  const m = /(?:^|\s)@([^\s@]{0,30})$/.exec(before);
  return m ? m[1] : null;
}

/** Forme d'onde normalisée sur 64 barres entre 0,08 et 1. */
export function normalizeWaveform(samples: ArrayLike<number>, bars = 64): number[] {
  const n = samples.length;
  if (n === 0) return Array(bars).fill(0.08);
  const per = Math.max(1, Math.floor(n / bars));
  const out: number[] = [];
  for (let b = 0; b < bars; b++) {
    let sum = 0;
    let count = 0;
    for (let i = b * per; i < Math.min(n, (b + 1) * per); i++) {
      sum += Math.abs(samples[i]);
      count++;
    }
    out.push(count ? sum / count : 0);
  }
  const max = Math.max(...out, 1e-6);
  return out.map((v) => Math.max(0.08, Math.min(1, v / max)));
}

/** Durée « 0:42 ». */
export function formatDuration(s: number): string {
  const total = Math.max(0, Math.round(s));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Clé de regroupement des pushs : une par conversation et par tranche de 10 minutes. */
export function pushGroupKey(channelId: string, at: Date): string {
  return `msg:${channelId}:${Math.floor(at.getTime() / 600_000)}`;
}

/** Peut-on encore supprimer son propre message (15 min) ? */
export function canDeleteOwn(createdAt: string, now = Date.now()): boolean {
  return now - new Date(createdAt).getTime() < MESSAGE_LIMITS.deleteWindowMs;
}

/** Compte à rebours de fin de groupe : « 3 jours », « 5 h », « moins d'une heure ». */
export function endsIn(endsAt: string | null, now = Date.now()): string | null {
  if (!endsAt) return null;
  const ms = new Date(endsAt).getTime() - now;
  if (ms <= 0) return "terminé";
  const h = Math.round(ms / 3_600_000);
  if (h < 1) return "moins d'une heure";
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} jours`;
}

/** Nombre de non-lus toutes conversations (hors coupées). */
export function totalUnread(list: Pick<Conversation, "unread" | "muted_until" | "archived_at">[], now = Date.now()): number {
  return list.reduce((sum, c) => sum + (c.archived_at || (c.muted_until && new Date(c.muted_until).getTime() > now) ? 0 : c.unread), 0);
}

/** Groupes du sélecteur de membres : service communication, référents par groupement, autres personnels. */
export function groupDirectory(people: DirectoryPerson[]): { title: string; people: DirectoryPerson[] }[] {
  const com = people.filter((p) => p.role === "editor" || p.role === "admin");
  const referents = people.filter((p) => p.is_referent && !com.includes(p));
  const others = people.filter((p) => !com.includes(p) && !referents.includes(p));
  const byGrouping = new Map<string, DirectoryPerson[]>();
  for (const r of referents) {
    const g = r.grouping ?? "Sans groupement";
    byGrouping.set(g, [...(byGrouping.get(g) ?? []), r]);
  }
  return [
    ...(com.length ? [{ title: "Service communication", people: com }] : []),
    ...[...byGrouping.entries()].sort(([a], [b]) => a.localeCompare(b, "fr")).map(([g, list]) => ({ title: `Référents · ${g}`, people: list })),
    ...(others.length ? [{ title: "Autres personnels", people: others }] : []),
  ];
}
