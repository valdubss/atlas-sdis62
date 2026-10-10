import "server-only";

/** Adresse publique de l'app pour les liens dans les e-mails. */
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
  return raw.replace(/\/+$/, "");
}
