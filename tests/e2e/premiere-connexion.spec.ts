import { test, expect } from "@playwright/test";
import { adminClient, completeOnboarding, loadEnv } from "./helpers";

/**
 * Première connexion par matricule, sans e-mail (réglage auth_first_access = "registry") :
 *  1. matricule absent du référentiel → refusé ; nom différent de la liste → refusé ;
 *  2. matricule + nom + prénom conformes → compte créé, session ouverte, accueil ;
 *  3. accueil : statut, centre obligatoire (centre de test, sans chef : demande en attente,
 *     notification aux seuls administrateurs), mot de passe personnel → fil ;
 *  4. reconnexion par matricule avec le nouveau mot de passe.
 * Le réglage est remis à sa valeur initiale, le centre et le compte supprimés.
 */
test("première connexion par matricule : refus, création, accueil, reconnexion", async ({ page }) => {
  const env = loadEnv();
  const admin = adminClient(env);
  const stamp = Date.now().toString(36);
  const matricule = `E2E${stamp}`.toUpperCase();
  const { data: before } = await admin.from("app_settings").select("value").eq("key", "auth_first_access").maybeSingle();
  let userId: string | null = null;
  let centerId: string | null = null;

  const openFirstAccess = async () => {
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Première connexion" }).click();
    await page.getByLabel("Nom", { exact: true }).fill(`Référencé-${stamp}`);
    await page.getByLabel("Prénom").fill("Agent");
  };

  try {
    await admin.from("app_settings").upsert({ key: "auth_first_access", value: "registry" });
    await admin.from("agents_registry").upsert({ matricule, email: null, last_name: `REFERENCE ${stamp}`, first_name: "agent", center_name: "Test", status: "spp" });
    await admin.from("rate_limit_events").delete().eq("bucket", "first_access");
    const { data: center } = await admin.from("centers").insert({ slug: `e2e-pc-${stamp}`, name: `CIS Test ${stamp}`, type: "cis", city: "Arras", sort_order: 999 }).select("id").single();
    centerId = center!.id;

    // --- 1. Refus : matricule inconnu, puis nom différent de la liste ------------------------
    await openFirstAccess();
    await page.getByLabel("Matricule").fill(`X${stamp}`);
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page.getByText(/n'est pas référencé/)).toBeVisible({ timeout: 15_000 });
    await page.getByLabel("Matricule").fill(matricule.toLowerCase());
    await page.getByLabel("Nom", { exact: true }).fill("Autre");
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page.getByText(/nom ne correspond pas/)).toBeVisible({ timeout: 15_000 });
    expect((await admin.from("profiles").select("id").ilike("matricule", matricule).maybeSingle()).data).toBeNull();

    // --- 2. Création : nom conforme (accents et casse ignorés), session ouverte -----------------
    await page.getByLabel("Nom", { exact: true }).fill(`référencé ${stamp}`);
    await page.getByRole("button", { name: "Continuer" }).click();
    await page.waitForURL(/\/bienvenue/, { timeout: 20_000 });
    const { data: created } = await admin.from("profiles").select("id, email, matricule, status, first_name, last_name, password_set_at").ilike("matricule", matricule).single();
    userId = created.id;
    expect(created).toMatchObject({ matricule, status: "spp", first_name: "agent", last_name: `REFERENCE ${stamp}`, password_set_at: null });
    expect(created.email).toBe(`${matricule.toLowerCase()}@sdis62.fr`);
    await expect(page.getByText(matricule)).toBeVisible();

    // --- 3. Accueil : identité, statut, centre obligatoire, mot de passe --------------------
    await page.getByLabel("Prénom").fill("Agent");
    await page.getByLabel("Nom", { exact: true }).fill(`Référencé ${stamp}`);
    await page.getByLabel(/Adresse e-mail personnelle/).fill(`e2e-pc-${stamp}@exemple.org`);
    await page.getByRole("button", { name: "Suivant" }).click();
    await page.getByRole("radio", { name: "SPV" }).click();
    await page.getByRole("button", { name: "Suivant" }).click();
    // Centre obligatoire : « Suivant » sans choix reste sur l'étape
    await page.getByRole("button", { name: "Suivant" }).click();
    await expect(page.getByText("Choisissez votre centre ou votre service.")).toBeVisible();
    await page.getByRole("button", { name: /Choisir mon centre/ }).click();
    await page.getByRole("dialog").getByLabel("Rechercher un centre").fill(`CIS Test ${stamp}`);
    await page.getByRole("dialog").getByText(`CIS Test ${stamp}`).first().click();
    const newPassword = `Perso-${stamp}-Mdp1`;
    await completeOnboarding(page, { firstName: "Agent", lastName: `Référencé ${stamp}`, password: newPassword });
    await page.waitForURL((u) => u.pathname === "/", { timeout: 20_000 });
    await expect.poll(async () => (await admin.from("profiles").select("status, onboarded_at, password_set_at").eq("id", userId!).single()).data, { timeout: 10_000 }).toMatchObject({ status: "spv" });
    const { data: done } = await admin.from("profiles").select("onboarded_at, password_set_at, personal_email").eq("id", userId).single();
    expect(done.personal_email).toBe(`e2e-pc-${stamp}@exemple.org`);
    expect(done.onboarded_at).not.toBeNull();
    expect(done.password_set_at).not.toBeNull();
    const { data: req } = await admin.from("membership_requests").select("status, center_id").eq("profile_id", userId).maybeSingle();
    expect(req).toMatchObject({ status: "pending", center_id: centerId });

    // --- 4. Reconnexion par matricule avec le mot de passe personnel ------------------------
    await page.goto("/auth/deconnexion", { waitUntil: "networkidle" }).catch(() => {});
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.getByLabel("Adresse e-mail ou matricule").fill(matricule.toLowerCase());
    await page.getByRole("textbox", { name: "Mot de passe" }).fill(newPassword);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL((u) => u.pathname === "/", { timeout: 20_000 });

    // Un second passage par « Première connexion » est refusé (compte accueilli)
    await page.goto("/auth/deconnexion", { waitUntil: "networkidle" }).catch(() => {});
    await openFirstAccess();
    await page.getByLabel("Matricule").fill(matricule);
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page.getByText(/Un compte existe déjà/)).toBeVisible({ timeout: 15_000 });
  } finally {
    await admin.from("app_settings").upsert({ key: "auth_first_access", value: before?.value ?? "link" });
    await admin.from("agents_registry").delete().eq("matricule", matricule);
    await admin.from("rate_limit_events").delete().eq("bucket", "first_access");
    await admin.from("notifications").delete().ilike("title", `%${stamp}%`);
    if (userId) await admin.auth.admin.deleteUser(userId);
    if (centerId) await admin.from("centers").delete().eq("id", centerId);
  }
});
