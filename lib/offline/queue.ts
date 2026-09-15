/**
 * File d'envoi différé (hors ligne) : réactions et messages sont gardés sur
 * l'appareil puis rejoués au retour du réseau, dans l'ordre. Les opérations
 * sont idempotentes côté serveur (réaction « posée », message par client_id).
 */
export type QueuedOp =
  | { id: string; kind: "reaction"; post_id: string; reaction: string | null; at: number }
  | { id: string; kind: "message"; client_id: string; channel_id: string; body: string | null; reply_to_id: string | null; mentions: string[]; mention_all: boolean; at: number };

export type QueuedOpInput =
  | { kind: "reaction"; post_id: string; reaction: string | null }
  | { kind: "message"; client_id: string; channel_id: string; body: string | null; reply_to_id: string | null; mentions: string[]; mention_all: boolean };

const KEY = "atlas:offline:queue:v1";
const MAX = 200;
const listeners = new Set<() => void>();

function read(): QueuedOp[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? (v as QueuedOp[]) : [];
  } catch {
    return [];
  }
}
function write(list: QueuedOp[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch {}
  for (const l of listeners) l();
}

/** Fusionne : une seule réaction en attente par publication (la dernière gagne). */
export function mergeOps(list: QueuedOp[], op: QueuedOp): QueuedOp[] {
  if (op.kind === "reaction") return [...list.filter((x) => !(x.kind === "reaction" && x.post_id === op.post_id)), op];
  if (list.some((x) => x.kind === "message" && x.client_id === op.client_id)) return list;
  return [...list, op];
}

export const offlineQueue = {
  list: read,
  size: () => read().length,
  enqueue(op: QueuedOpInput): QueuedOp {
    const full = { ...op, id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()), at: Date.now() } as QueuedOp;
    write(mergeOps(read(), full));
    return full;
  },
  remove(id: string) {
    write(read().filter((x) => x.id !== id));
  },
  clear() {
    write([]);
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** Rejoue la file dans l'ordre ; s'arrête à la première erreur réseau, retire les échecs définitifs. */
  async flush(run: (op: QueuedOp) => Promise<"done" | "retry" | "drop">): Promise<{ done: number; left: number }> {
    let done = 0;
    for (const op of read()) {
      let r: "done" | "retry" | "drop";
      try {
        r = await run(op);
      } catch {
        r = "retry";
      }
      if (r === "retry") break;
      offlineQueue.remove(op.id);
      if (r === "done") done++;
    }
    return { done, left: read().length };
  },
};

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}
