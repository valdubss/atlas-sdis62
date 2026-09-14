import type { NextConfig } from "next";

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
  reactStrictMode: true,
  poweredByHeader: false,
  images: { remotePatterns, formats: ["image/webp"] },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
