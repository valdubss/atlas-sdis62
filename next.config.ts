import type { NextConfig } from "next";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const s3PublicUrl = process.env.NEXT_PUBLIC_S3_PUBLIC_URL;
const remotePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [];
if (s3PublicUrl) {
  try {
    const u = new URL(s3PublicUrl);
    remotePatterns.push({
      protocol: u.protocol.replace(":", "") as "http" | "https",
      hostname: u.hostname,
      pathname: "/**",
    });
  } catch {
    // URL invalide : ignorée, next/image refusera les images distantes.
  }
}

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // HTTPS imposé deux ans, sous-domaines compris (Vercel sert déjà en HTTPS)
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    // geolocation=(self) : « Autour de moi » sur la carte de l'annuaire, à la demande seulement
    value: "camera=(), microphone=(), geolocation=(self), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  env: {
    // Logo image présent dans public/ ? (évalué au démarrage et à la construction)
    NEXT_PUBLIC_HAS_LOGO: existsSync(path.join(process.cwd(), "public", "logo-atlas.png")) ? "1" : "0",
    NEXT_PUBLIC_APP_VERSION: (JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as { version: string }).version,
    // Identifiant de déploiement (commit sur Vercel) : change l'adresse du service worker à
    // chaque mise en ligne, ce qui déclenche la bulle « Nouvelle version » sur les appareils
    NEXT_PUBLIC_BUILD_ID: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || String(Date.now()),
  },
  reactStrictMode: true,
  // ffmpeg embarqué (transcodage HLS) : binaire hors bundle, inclus dans les seules fonctions
  // /api/video/* ; partout ailleurs il est exclu du traçage (80 Mo par copie, sinon recopié
  // dans chaque fonction de chaque déploiement : c'est ce qui remplissait le stockage Vercel).
  // Les autres fonctions passent par lib/video/remote (appel HTTP interne).
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: { "/api/video/transcode": ["./node_modules/ffmpeg-static/ffmpeg*"], "/api/video/subtitles": ["./node_modules/ffmpeg-static/ffmpeg*"] },
  outputFileTracingExcludes: {
    "/api/cron/**": ["./node_modules/ffmpeg-static/**"],
    "/api/push/**": ["./node_modules/ffmpeg-static/**"],
    "/api/health/**": ["./node_modules/ffmpeg-static/**"],
    "/studio/**": ["./node_modules/ffmpeg-static/**"],
    "/admin/**": ["./node_modules/ffmpeg-static/**"],
    "/centre/**": ["./node_modules/ffmpeg-static/**"],
    "/messages/**": ["./node_modules/ffmpeg-static/**"],
    "/profil/**": ["./node_modules/ffmpeg-static/**"],
  },
  // Les pages visitées restent 30 s dans le cache du routeur : changer d'onglet
  // et revenir est instantané ; tirer-pour-actualiser force le rechargement.
  experimental: { staleTimes: { dynamic: 30, static: 180 } },
  devIndicators: false,
  poweredByHeader: false,
  images: { remotePatterns, formats: ["image/webp"] },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
