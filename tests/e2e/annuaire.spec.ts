import { expect, test } from "@playwright/test";
import { adminClient, createTestUser, loadEnv, loginWithPassword } from "./helpers";

const env = loadEnv();
const admin = adminClient(env);

/** Recherche d'un service, appel (lien tel: vérifié), fiche compacte, agent visible, hors ligne. */
test("annuaire : recherche d'un service, appel tel:, agent visible, hors ligne", async ({ browser }) => {
  const agent = await createTestUser(admin, "annuaire");
  const { stamp } = agent;
  const { data: service } = await admin.from("services").insert({ slug: `e2e-service-${stamp}`, name: `Service formation ${stamp}`, short_description: "Stages et recyclages", contact_reasons: ["Inscription à un stage"], phone: "03 21 58 18 30" }).select("id, slug").single();
  const { data: center } = await admin.from("centers").insert({ slug: `e2e-annuaire-${stamp}`, name: `CIS Annuaire ${stamp}`, type: "cis", city: "Béthune", phone: "03 21 00 00 01", lat: 50.53, lng: 2.64 }).select("id").single();
  await admin.from("profiles").update({ center_id: center!.id, directory_visible: true, job_title: "Chef d'agrès", work_phone: "06 00 00 00 00", first_name: "Camille", last_name: `Visible${stamp}` }).eq("id", agent.id);

  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginWithPassword(page, agent.email, agent.password);
    await page.goto("/annuaire", { waitUntil: "networkidle" });

    // Service : recherche + tel:
    await page.getByLabel("Rechercher dans l'annuaire").fill("formation");
    await page.getByRole("tab", { name: /Services/ }).click();
    const row = page.locator("li", { hasText: `Service formation ${stamp}` });
    await expect(row).toBeVisible();
    await expect(row.getByRole("link", { name: /Appeler/ })).toHaveAttribute("href", "tel:0321581830");
    await row.getByRole("button").click();
    await expect(page.getByText("Inscription à un stage")).toBeVisible();
    await page.keyboard.press("Escape");

    // Agent visible : trouvé même avec une faute
    await page.getByLabel("Rechercher dans l'annuaire").fill(`visble${stamp}`);
    await expect(page.getByText(`Camille Visible${stamp}`)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("link", { name: `Appeler Camille Visible${stamp}` })).toHaveAttribute("href", "tel:0600000000");

    // Retrait de l'annuaire : disparaît de la recherche
    await admin.from("profiles").update({ directory_visible: false }).eq("id", agent.id);
    await page.getByLabel("Rechercher dans l'annuaire").fill(`visible${stamp}`);
    await page.waitForTimeout(800);
    await expect(page.getByText(`Camille Visible${stamp}`)).toHaveCount(0);

    // Centre : fiche compacte avec itinéraire
    await page.getByLabel("Rechercher dans l'annuaire").fill(stamp);
    await page.getByRole("tab", { name: /Centres/ }).click();
    await page.locator("li", { hasText: `CIS Annuaire ${stamp}` }).getByRole("button").click();
    await expect(page.getByRole("link", { name: /Itinéraire/ })).toBeVisible();
    await page.keyboard.press("Escape");

    // Hors ligne : la page et les données restent disponibles via le service worker
    // (en production seulement : le SW n'est enregistré qu'en build) — on vérifie l'API.
    const res = await page.request.get("/api/annuaire/data");
    expect(res.ok()).toBe(true);
    const json = (await res.json()) as { centers: { name: string }[]; services: unknown[] };
    expect(json.centers.some((c) => c.name === `CIS Annuaire ${stamp}`)).toBe(true);
    expect(JSON.stringify(json)).not.toContain("Visible");
  } finally {
    await admin.from("services").delete().eq("id", service!.id);
    await admin.from("centers").delete().eq("id", center!.id);
    await admin.auth.admin.deleteUser(agent.id);
  }
});
