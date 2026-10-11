import { expect, test } from "@playwright/test";
import { adminClient, createTestUser, loadEnv, loginWithPassword } from "./helpers";

const env = loadEnv();
const admin = adminClient(env);

/**
 * Administration → Centres : import des chefs de centre et responsables com par collage,
 * vérification (aperçu) puis application ; le centre est reconnu par son nom sans accents,
 * la valeur précédente est rétablie à la fin.
 */
test("administration : import des chefs de centre et responsables com", async ({ browser }) => {
  test.setTimeout(120_000);
  const superUser = await createTestUser(admin, "adm");
  await admin.from("profiles").update({ role: "admin" }).eq("id", superUser.id);
  // Centre inactif de test, créé pour l'occasion (jamais visible des agents)
  const stamp = superUser.stamp;
  const { data: center } = await admin
    .from("centers")
    .insert({ name: `Import Test ${stamp}`, slug: `import-test-${stamp}`, city: "Arras", type: "cis", is_active: false, sort_order: 999 })
    .select("id")
    .single();
  const page = await (await browser.newContext()).newPage();
  try {
    await loginWithPassword(page, superUser.email, superUser.password);
    await page.goto("/admin/centres", { waitUntil: "networkidle" });
    const box = page.getByLabel("Lignes à importer");
    await box.fill(`centre;chef;e-mail;responsable com;e-mail\nimport test ${stamp} ; Capitaine Test ; chef-${stamp}@sdis62.fr ; Sergent Test ; com-${stamp}@sdis62.fr\nCentre Inexistant ${stamp} ; ; x@sdis62.fr`);
    await page.getByRole("button", { name: "Vérifier" }).click();
    await expect(page.getByText(/1 centre\(s\) reconnu\(s\) sur 2 ligne\(s\)/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Centre introuvable.")).toBeVisible();
    await page.getByRole("button", { name: /Appliquer 1 modification/ }).click();
    await expect(page.getByText("1 centre(s) mis à jour")).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => (await admin.from("centers").select("chief_email, com_name").eq("id", center!.id).single()).data, { timeout: 10_000 })
      .toEqual({ chief_email: `chef-${stamp}@sdis62.fr`, com_name: "Sergent Test" });
  } finally {
    if (center) await admin.from("centers").delete().eq("id", center.id);
    await admin.auth.admin.deleteUser(superUser.id);
  }
});
