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
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  env: {
    // Logo image présent dans public/ ? (évalué au démarrage et à la construction)
    NEXT_PUBLIC_HAS_LOGO: existsSync(path.join(process.cwd(), "public", "logo-atlas.png")) ? "1" : "0",
    NEXT_PUBLIC_APP_VERSION: (JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as { version: string }).version,
  },
  reactStrictMode: true,
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
