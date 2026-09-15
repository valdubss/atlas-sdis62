import { defineConfig, devices } from "@playwright/test";

/**
 * Tests de bout en bout (npm run test:e2e). Nécessite un serveur lancé
 * (npm run dev ou npm start) et .env.local (URL Supabase, clé service_role).
 * Les comptes et centres de test sont créés puis supprimés par chaque test.
 * Le test vidéo demande Google Chrome installé (codecs H.264).
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    locale: "fr-FR",
    colorScheme: "dark",
    trace: "retain-on-failure",
  },
  // Chrome de la machine (H.264 et HLS lisibles, contrairement au Chromium open source) ; E2E_CHANNEL=chromium pour forcer le Chromium de Playwright
  projects: [{ name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium", channel: process.env.E2E_CHANNEL === "chromium" ? undefined : "chrome" } }],
});
