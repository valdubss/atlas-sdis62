/**
 * Test de charge k6 : pic de lecture après un flash urgent.
 *
 *   k6 run -e BASE_URL=https://atlas-sdis62.vercel.app -e COOKIE="sb-…=…" tests/load/flash.js
 *
 * Scénario : 300 agents ouvrent le fil dans la minute qui suit une push
 * (montée 30 s, plateau 60 s, descente 30 s), puis un tiers ouvre une
 * publication. Le cookie d'une session d'agent de test est fourni en variable
 * (jamais celle d'un compte réel). Seuils : p95 < 1,5 s sur le fil, < 1 % d'erreurs.
 */
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    flash: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 300 },
        { duration: "60s", target: 300 },
        { duration: "30s", target: 0 },
      ],
    },
  },
  thresholds: {
    "http_req_duration{page:feed}": ["p(95)<1500"],
    "http_req_duration{page:post}": ["p(95)<2000"],
    http_req_failed: ["rate<0.01"],
  },
};

const BASE = __ENV.BASE_URL || "http://localhost:3000";
const COOKIE = __ENV.COOKIE || "";
const POST = __ENV.POST_SLUG || "";

export default function () {
  const headers = COOKIE ? { Cookie: COOKIE } : {};
  const feed = http.get(`${BASE}/`, { headers, tags: { page: "feed" } });
  check(feed, { "fil : 200": (r) => r.status === 200 });
  sleep(Math.random() * 3 + 1);
  if (POST && Math.random() < 0.33) {
    const post = http.get(`${BASE}/post/${POST}`, { headers, tags: { page: "post" } });
    check(post, { "publication : 200": (r) => r.status === 200 });
    sleep(Math.random() * 5 + 2);
  }
  const health = http.get(`${BASE}/api/health`, { tags: { page: "health" } });
  check(health, { "état : 200": (r) => r.status === 200 });
}
