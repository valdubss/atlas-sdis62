/**
 * Content-Security-Policy : scripts du domaine et scripts en ligne porteurs du nonce de la
 * requête (`strict-dynamic` laisse Next charger ses morceaux), styles en ligne tolérés
 * (Tailwind, framer-motion), images / médias / connexions limités au domaine, à Supabase,
 * au stockage S3 éventuel et aux fonds de carte (OpenFreeMap, IGN).
 * Posée par le proxy sur chaque réponse HTML ; le nonce voyage dans l'en-tête `x-nonce`.
 */
export function buildCsp(nonce: string): string {
  const dev = process.env.NODE_ENV !== "production";
  const origins = new Set<string>();
  for (const raw of [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_S3_PUBLIC_URL]) {
    try {
      if (raw) origins.add(new URL(raw).origin);
    } catch {
      // URL invalide : ignorée
    }
  }
  const supabase = [...origins].join(" ");
  const supabaseWs = [...origins].filter((o) => o.includes("supabase")).map((o) => o.replace(/^https:/, "wss:")).join(" ");
  const map = "https://tiles.openfreemap.org https://data.geopf.fr";
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${supabase} ${map}`,
    `media-src 'self' blob: data: ${supabase}`,
    "font-src 'self' data:",
    `connect-src 'self' ${supabase} ${supabaseWs} ${map}${dev ? " ws://localhost:* http://localhost:*" : ""}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  if (!dev) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

/** Nonce aléatoire (base64) pour les scripts en ligne de la requête. */
export function makeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
