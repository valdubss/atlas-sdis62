import { defineConfig, devices } from "@playwright/test";

/**
 * Tests de bout en bout (npm run test:e2e). Nécessite un serveur lancé
 * (npm run dev ou npm start) et .env.local (URL Supabase, clé service_role).
 * Les comptes et centres de test sont créés puis supprimés par chaque test.
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
  projects: [{ name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } }],
});
