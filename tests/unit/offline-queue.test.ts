import { beforeEach, describe, expect, it } from "vitest";
import { mergeOps, offlineQueue, type QueuedOp } from "@/lib/offline/queue";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
  });
});

describe("file hors ligne", () => {
  it("ne garde qu'une réaction par publication et pas deux fois le même message", () => {
    const base: QueuedOp[] = [{ id: "1", kind: "reaction", post_id: "p1", reaction: "clap", at: 1 }];
    const merged = mergeOps(base, { id: "2", kind: "reaction", post_id: "p1", reaction: null, at: 2 });
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: "2", reaction: null });
    const m: QueuedOp = { id: "3", kind: "message", client_id: "c1", channel_id: "ch", body: "x", reply_to_id: null, mentions: [], mention_all: false, at: 3 };
    expect(mergeOps(mergeOps(merged, m), { ...m, id: "4" })).toHaveLength(2);
  });

  it("rejoue dans l'ordre, s'arrête sur un échec réseau et retire les échecs définitifs", async () => {
    offlineQueue.enqueue({ kind: "reaction", post_id: "a", reaction: "fire" });
    offlineQueue.enqueue({ kind: "message", client_id: "m1", channel_id: "ch", body: "bonjour", reply_to_id: null, mentions: [], mention_all: false });
    offlineQueue.enqueue({ kind: "reaction", post_id: "b", reaction: "heart" });
    const seen: string[] = [];
    const r1 = await offlineQueue.flush(async (op) => {
      seen.push(op.kind === "reaction" ? op.post_id : op.client_id);
      return op.kind === "message" ? "retry" : "done";
    });
    expect(seen).toEqual(["a", "m1"]);
    expect(r1).toEqual({ done: 1, left: 2 });
    const r2 = await offlineQueue.flush(async (op) => (op.kind === "message" ? "drop" : "done"));
    expect(r2).toEqual({ done: 1, left: 0 });
  });
});
