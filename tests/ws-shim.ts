/**
 * Node 20 n'a pas de WebSocket natif : supabase-js (realtime) refuse alors de
 * s'initialiser. Les tests n'ouvrent jamais de canal temps réel, un substitut
 * inerte suffit. Inutile à partir de Node 22.
 */
const g = globalThis as { WebSocket?: unknown };
if (typeof g.WebSocket === "undefined") {
  g.WebSocket = class WebSocketShim {
    constructor() {
      throw new Error("WebSocket indisponible dans les tests");
    }
  };
}
export {};
